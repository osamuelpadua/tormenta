import fs from 'node:fs';
const pages=JSON.parse(fs.readFileSync('.cache/pdf/book.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('src/data/catalog.json','utf8'));
const slug=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const num=s=>Number(s.replaceAll('.','').replace(',','.'));
const list=[];
const base=(name,page)=>({id:slug(name),name,page,category:'Equipamento de aventura',quantity:1,spaces:1,price:0,state:'carried',benefit:true,hands:0,defense:0,penalty:0,heavy:false,proficiency:'',damage:'',damageType:'impacto',threat:20,critical:2,range:'Corpo a corpo',attackType:'melee',notes:'',modifiers:[],improvements:[],enchantments:[]});
let proficiency='simples',hands=1,attackType='melee';
for(const n of [150,151])for(const line of pages[n-1].text.split('\n').map(s=>s.trim())){
 if(line.startsWith('Armas Marciais'))proficiency='marciais';if(line.startsWith('Armas Exóticas'))proficiency='exoticas';if(line.startsWith('Armas de Fogo'))proficiency='fogo';
 if(line.startsWith('Corpo a Corpo')||line.startsWith('Ataque à Distância')){hands=line.includes('Duas')?2:1;attackType=line.startsWith('Ataque')?'ranged':'melee';}
 const m=line.match(/^(.+?) (?:T\$ ([\d.,]+)|(—)) ([\dd/]+|—) ([\dx/]+|—) (Curto|Médio|Longo|—) ([\p{L}/]+|—) (\d)$/u);
 if(!m)continue;
 const item=base(m[1],n-6);Object.assign(item,{category:m[4]==='—'&&/\(20\)/.test(m[1])?'Munição':'Arma',price:m[2]?num(m[2]):0,damage:m[4]==='—'?'':m[4].split('/')[0],damageType:m[7].split('/')[0].toLowerCase()==='—'?'impacto':m[7].split('/')[0].toLowerCase(),spaces:Number(m[8]),range:m[6]==='—'?'Corpo a corpo':m[6],proficiency,hands,attackType:['Azagaia','Rede'].includes(m[1])?'thrown':attackType,threat:/^(18|19)/.test(m[5])?Number(m[5].slice(0,2)):20,critical:Number(m[5].match(/x(\d)/)?.[1]??2)});
 item.notes=catalog.find(e=>slug(e.name)===slug(item.name))?.description??''; list.push(item);
}
let armorCategory='Armadura leve';
for(const line of pages[158].text.split('\n').map(s=>s.trim())){
 if(line==='Armaduras Pesadas')armorCategory='Armadura pesada';if(line==='Escudos')armorCategory='Escudo';
 const m=line.match(/^(.+?) T\$ ([\d.,]+) \+(\d+) (0|[–−-]\d+) (\d)$/);if(!m)continue;
 const item=base(m[1],153);Object.assign(item,{category:armorCategory,price:num(m[2]),defense:Number(m[3]),penalty:Number(m[4].replace(/[–−]/g,'-')),spaces:Number(m[5]),heavy:armorCategory==='Armadura pesada',proficiency:armorCategory==='Escudo'?'escudos':armorCategory==='Armadura pesada'?'pesadas':'leves',hands:armorCategory==='Escudo'?1:0});item.notes=catalog.find(e=>slug(e.name)===slug(item.name))?.description??'';list.push(item);
}
for(const n of [162,163])for(const m of pages[n-1].text.matchAll(/([\p{L}<>\d() -]+) T\$ ([\d.,]+)(?: por km)? ([\d.,]+|—)/gu)){
 const name=m[1].trim();if(!name||/^\d|^(comum|confortável|luxuosa|terrestre|marítima|aérea)$/.test(name))continue;
 const item=base(name,n-6);Object.assign(item,{price:num(m[2]),spaces:m[3]==='—'?0:num(m[3])});
 const entry=catalog.find(e=>slug(e.name)===slug(name));item.notes=entry?.description??'';if(entry)item.entryId=entry.id;
 if(/Chapéu|Enfeite|Farrapos|Gorro|Luva de pelica|Manopla|Manto|Robe|Sapatos|Tabardo|Traje|Veste|Andrajos|Bandana|Botas|Camisa|Capa|Casaco/.test(name))item.category='Vestuário';
 if(/Alaúde|Coleção|Equipamento de viagem|Estojo|Flauta|Gazua|Instrumento|Luneta|Maleta|Sela|Tambor/.test(name))item.category='Ferramenta';
 if(/Bolsa de pó|Cajado arcano|Cetro|Costela|Dedo de ente|Luva de ferro|Medalhão|Orbe|Tomo|Varinha/.test(name)){item.category='Esotérico';item.hands=1;}
 if(/Batata|Gorad|Macarrão|Prato|Ração|Refeição|Sopa/.test(name))item.category='Alimentação';
 if(/Ácido|Bálsamo|Bomba|Cosmético|Elixir|Essência|Fogo alquímico|Pó |Baga|Dente|Líquen|Musgo|Ossos|Ramo|Saco de sal|Seixo|Terra|Beladona|Bruma|Cicuta|Névoa|Peçonha|Riso/.test(name))item.category='Alquímico';
 if(/Cão|Cavalo|Pônei|Trobo/.test(name)){item.category='Animal';item.state='stored';}
 if(/Balão|Carroça|Carruagem|Canoa|Veleiro/.test(name)){item.category='Veículo';item.state='stored';}
 if(['Traje de viajante','Mochila'].includes(name))item.benefit=false;
 list.push(item);
}
const unique=[...new Map(list.map(i=>[i.id,i])).values()];
fs.writeFileSync('src/data/equipment.json',JSON.stringify(unique,null,2));console.log(`${unique.length} itens das tabelas de armas, armaduras e itens gerais.`);
