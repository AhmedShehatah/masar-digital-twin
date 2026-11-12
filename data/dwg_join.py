import json,sys,re,collections
jpath,gpath,opath=sys.argv[1:4]
d=json.load(open(jpath,encoding='utf-8',errors='replace'))
O=d['OBJECTS']; H={o['handle'][2]:o for o in O if 'handle' in o}
def attrs(ent):
    x=ent.get('xdicobjhandle')
    if not x: return {}
    dct=H.get(x[-1]); out={}
    if not dct or 'items' not in dct: return {}
    ea=dct['items'].get('ESRI_Attributes')
    if not ea: return {}
    ead=H.get(ea[-1],{})
    for k,v in (ead.get('items') or {}).items():
        xr=H.get(v[-1],{}); xd=xr.get('xdata') or []
        out[k]=xd[0][1] if xd else None
    return out
def popup(html):
    cells=[re.sub(r'<[^>]+>','',c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>',html or '',re.S)]
    res={}
    for i in range(len(cells)-1):
        a,b=cells[i],cells[i+1]
    # rows of 2 tds
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>',html or '',re.S):
        tds=[re.sub(r'<[^>]+>','',c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)]
        if len(tds)==2 and tds[0] and tds[0] not in res: res[tds[0]]=tds[1]
    return res
A={}
for o in O:
    if 'entity' in o and 'handle' in o:
        a=attrs(o)
        if a: A[format(o['handle'][2],'X')]=a
raw=open(gpath,encoding='utf-8',errors='replace').read()
g=json.loads(raw)
feats=[]
for f in g['features']:
    if not f.get('geometry'): continue
    a=A.get(str(f.get('id')).upper(),{})
    p={'layer':(f.get('properties') or {}).get('Layer'),'handle':f.get('id')}
    if a:
        p['name']=a.get('Name'); p['folder']=a.get('FolderPath')
        pp=popup(a.get('PopupInfo'))
        for k,v in pp.items():
            if k not in('Name','FolderPath','SymbolID','AltMode','Base','Snippet','PopupInfo','HasLabel','LabelID','OID','FID'): p['attr_'+k]=v
    # close polygons drawn as LineString
    geom=f['geometry']
    if geom['type']=='LineString' and p['layer']=='Polygons' and len(geom['coordinates'])>2:
        cs=geom['coordinates']
        if cs[0]!=cs[-1]: cs=cs+[cs[0]]
        geom={'type':'Polygon','coordinates':[cs]}
    feats.append({'type':'Feature','properties':p,'geometry':geom})
json.dump({'type':'FeatureCollection','features':feats},open(opath,'w',encoding='utf-8'),ensure_ascii=False)
print(opath.split('/')[-1],'features',len(feats),'with attrs',sum(1 for f in feats if 'name' in f['properties']))
fold=collections.Counter((f['properties'].get('folder') or '-', f['geometry']['type']) for f in feats)
for (k,t),n in fold.most_common(60): print('  ',n,t,k)
keys=collections.Counter(k for f in feats for k in f['properties'] if k.startswith('attr_'))
print(' popup fields',dict(keys))
names=collections.Counter(f['properties'].get('name') for f in feats if f['properties'].get('name'))
print(' names(sample)',[n for n,_ in names.most_common()][:90])
