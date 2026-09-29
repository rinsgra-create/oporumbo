
import re, unicodedata, logging
import httpx
from bs4 import BeautifulSoup

UA={"User-Agent":"OpoRumbo/0.13 (+educational planning prototype)"}

def boe_search_params(query):
    # BOE validates the complete form, including field order and empty fields.
    params={"campo[0]":"ORIS","operador[0]":"and","accion":"Buscar",
            "page_hits":"50","sort_field[0]":"FPU","sort_order[0]":"desc",
            "sort_field[1]":"ORI","sort_order[1]":"asc","sort_field[2]":"REF","sort_order[2]":"asc"}
    for section in ("1","2","3","4","5","T"):params[f"dato[0][{section}]"]=section
    for i,field in enumerate(("TITULOS","DEM","DOC","NBOS","NOF"),1):
        params[f"campo[{i}]"]=field;params[f"dato[{i}]"]=query if i==1 else "";params[f"operador[{i}]"]="and"
    params.update({"campo[6]":"FPU","operador[6]":"and","dato[6][0]":"","dato[6][1]":""})
    return params

def norm(s):
    return unicodedata.normalize("NFD",(s or "").lower()).encode("ascii","ignore").decode()

def search_catalog(catalog,q):
    words=[w for w in norm(q).split() if len(w)>1]
    found=[]
    for o in catalog:
        hay=norm(" ".join([o.get("name",""),o.get("year",""),o.get("source_name","")]))
        score=sum(3 if w in norm(o.get("name","")) else 1 for w in words if w in hay)
        if score:
            found.append((score,o))
    found.sort(key=lambda x:x[0],reverse=True)
    return [{
        "kind":"catalog",
        "id":o["id"],
        "name":o["name"],
        "subtitle":o.get("year",""),
        "source_name":o.get("source_name",""),
        "verified":bool(o.get("verified")),
        "topics_count":len(o.get("topics",[]))
    } for _,o in found[:5]]

async def search_boe(q):
    if re.fullmatch(r"BOE-[A-Z]-\d{4}-\d+",q,re.I):
        return [{"kind":"boe","boe_id":q.upper(),"name":q.upper(),"subtitle":"Documento oficial · pendiente de revisar","verified":False}]
    # BOE's public search form supports title/full-document search.
    # We search broad text because opposition titles vary greatly.
    url="https://www.boe.es/buscar/boe.php"
    try:
        async with httpx.AsyncClient(timeout=20,follow_redirects=True,headers=UA) as client:
            r=await client.get(url,params=boe_search_params(q))
            r.raise_for_status()
        soup=BeautifulSoup(r.text,"html.parser")
        if "valores de busqueda enviados son incorrectos" in norm(soup.get_text(" ",strip=True)):
            raise ValueError("BOE rechazó los parámetros de búsqueda")
        results=[]
        seen=set()
        for a in soup.select('a[href*="doc.php?id=BOE-"]'):
            href=a.get("href","")
            m=re.search(r'id=(BOE-[A-Z]-\d{4}-\d+)',href,re.I)
            if not m: continue
            boe_id=m.group(1).upper()
            if boe_id in seen: continue
            seen.add(boe_id)
            title=" ".join(a.get_text(" ",strip=True).split())
            parent=a.find_parent("li",class_="resultado-busqueda") or a.find_parent(["li","div","article","tr"]) or a.parent
            context=" ".join(parent.get_text(" ",strip=True).split()) if parent else title
            heading=parent.select_one("p:not([class])") if parent else None
            if heading:
                title=heading.get_text(" ",strip=True)
            elif len(title)<15 or "Ir al documento" in title:
                title=context[:350]
            results.append({
                "kind":"boe",
                "boe_id":boe_id,
                "name":title[:500],
                "subtitle":"Resultado BOE — requiere revisar convocatoria",
                "source_url":"https://www.boe.es/buscar/doc.php?id="+boe_id,
                "verified":False
            })
            if len(results)>=6: break
        return results
    except Exception as e:
        logging.getLogger(__name__).warning("BOE search unavailable (%s)",type(e).__name__)
        raise RuntimeError("La búsqueda del BOE no está disponible. Puedes consultar el catálogo o introducir un identificador BOE.") from e

async def inspect_boe(boe_id):
    if not re.fullmatch(r"BOE-[A-Z]-\d{4}-\d+",boe_id,re.I):
        raise ValueError("Identificador BOE no válido")
    boe_id=boe_id.upper()
    url="https://www.boe.es/buscar/doc.php?id="+boe_id
    async with httpx.AsyncClient(timeout=25,follow_redirects=True,headers=UA) as client:
        r=await client.get(url)
        r.raise_for_status()
    soup=BeautifulSoup(r.text,"html.parser")
    h=soup.find("h3") or soup.find("h2") or soup.find("title")
    title=" ".join(h.get_text(" ",strip=True).split()) if h else boe_id

    # Use structured page text. Many Spanish public exam calls label syllabus entries "Tema 1..."
    text=soup.get_text("\n",strip=True)
    lines=[" ".join(x.split()) for x in text.splitlines() if x.strip()]
    topics=[]
    pattern=re.compile(r"^(?:Tema|TEMA)\s*(\d+)[\.\-:ºª\s]+(.+)$",re.I)
    for line in lines:
        m=pattern.match(line)
        if not m: continue
        n=int(m.group(1)); name=m.group(2).strip(" .-:")
        if len(name)<2: continue
        if not any(t["n"]==n for t in topics):
            topics.append({"n":n,"name":name[:300],"blocks":[name[:300]]})

    # A second pass catches "Tema 1. Foo" embedded in longer HTML text.
    if len(topics)<2:
        compact=re.sub(r"\s+"," ",text)
        matches=list(re.finditer(r"\bTema\s+(\d+)\s*[\.\-:]\s*(.{3,250}?)(?=\s+Tema\s+\d+\s*[\.\-:]|\s+ANEXO|\Z)",compact,re.I))
        for m in matches[:100]:
            n=int(m.group(1)); body=m.group(2).strip()
            name=body.split(". ")[0][:220]
            if not any(t["n"]==n for t in topics):
                topics.append({"n":n,"name":name,"blocks":[body[:700]]})

    topics.sort(key=lambda x:x["n"])
    return {
        "boe_id":boe_id,
        "name":title,
        "source_name":boe_id+" — BOE",
        "source_url":url,
        "verified":False,
        "research_status":"automatic_extraction",
        "topics":topics,
        "topics_count":len(topics),
        "warning":"Extracción automática preliminar. Confirma que corresponde a tu proceso y revisa el programa oficial antes de darlo por verificado."
    }
