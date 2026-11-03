// Jordan's delivered seagull (art/deliveries/seagull-game-code.zip), used as delivered: gull style 2 in src/sea/sealife.js (v688).
// Emberwild seagull. Procedural, continuous low-poly shell with a weighted six-bone rig.
// Y up, +Z forward; metres/tiles, matching the boat and dolphin. No model imports.
let SEAGULL_SHAPE = null;
export const SEAGULL_BONES = Object.freeze([
  { name: 'body', parent: -1, pivot: [0, 0, 0], axis: 'x' },
  { name: 'wing_right_inner', parent: 0, pivot: [.075, .055, -.01], axis: 'z' },
  { name: 'wing_right_outer', parent: 1, pivot: [.38, .185, -.03], axis: 'z' },
  { name: 'wing_left_inner', parent: 0, pivot: [-.075, .055, -.01], axis: 'z' },
  { name: 'wing_left_outer', parent: 3, pivot: [-.38, .185, -.03], axis: 'z' },
  { name: 'tail', parent: 0, pivot: [0, -.005, -.27], axis: 'x' }
]);
const gullSmooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export function seagullShape() {
  if (SEAGULL_SHAPE) return SEAGULL_SHAPE;
  const vertices = [], polygons = [], weights = [], N = 16;
  const vertex = (p,w) => { const i=vertices.length;vertices.push(p);weights.push(w);return i; };
  const bodyWeights = z => { const t=gullSmooth((-.24-z)/.15);return t>0?[[0,1-t],[5,t]]:[[0,1]]; };
  const wingWeights = (x,side) => {
    const inner=side>0?1:3,outer=inner+1;
    if(x<.24){const t=gullSmooth((x-.09)/.15);return [[0,1-t],[inner,t]];}
    const t=gullSmooth((x-.32)/.18);return [[inner,1-t],[outer,t]];
  };
  // z, half-width, half-height, vertical centre. Beak through head/body to tail fan.
  const stations=[
    [.34,.006,.007,.12],[.30,.024,.015,.125],[.24,.032,.02,.13],
    [.216,.045,.05,.145],[.168,.062,.065,.14],[.112,.068,.072,.105],
    [.056,.084,.083,.055],[-.024,.10,.095,.005],[-.112,.095,.087,-.02],
    [-.208,.073,.063,-.015],[-.288,.05,.045,-.005],[-.344,.073,.020,-.007],
    [-.416,.11,.010,-.012]
  ];
  const rings=stations.map(([z,w,h,y])=>Array.from({length:N},(_,j)=>{
    const a=j/N*Math.PI*2;return vertex([w*Math.cos(a),y+h*Math.sin(a),z],bodyWeights(z));
  }));
  const cells=[];
  for(let i=0;i<rings.length-1;i++){
    cells[i]=[];
    for(let j=0;j<N;j++){
      cells[i][j]=polygons.length;
      polygons.push({ids:[rings[i][j],rings[i+1][j],rings[i+1][(j+1)%N],rings[i][(j+1)%N]],tag:'body'});
    }
  }
  const front=vertex([0,.12,.35],[[0,1]]),back=vertex([0,-.012,-.43],[[5,1]]);
  for(let j=0;j<N;j++){
    polygons.push({ids:[front,rings[0][(j+1)%N],rings[0][j]],tag:'beak'});
    polygons.push({ids:[back,rings.at(-1)[j],rings.at(-1)[(j+1)%N]],tag:'tail'});
  }
  // Replace a body patch with a spanwise extension of that same skin boundary.
  function patchBoundary(i0,i1,j0,j1){
    const loop=[],id=(i,j)=>rings[i][(j+N)%N];
    for(let i=i0;i<i1;i++)for(let j=j0;j<j1;j++)polygons[cells[i][(j+N)%N]]=null;
    for(let i=i0;i<i1;i++)loop.push(id(i,j0));
    for(let j=j0;j<j1;j++)loop.push(id(i1,j));
    for(let i=i1;i>i0;i--)loop.push(id(i,j1));
    for(let j=j1;j>j0;j--)loop.push(id(i0,j));
    return loop;
  }
  function bridge(a,b,tag){for(let j=0;j<a.length;j++)polygons.push({ids:[a[j],b[j],b[(j+1)%b.length],a[(j+1)%a.length]],tag});}
  function close(loop,end,tag){for(let j=0;j<loop.length;j++)polygons.push({ids:[loop[j],end,loop[(j+1)%loop.length]],tag});}
  for(const side of [1,-1]){
    const loop=patchBoundary(5,9,side>0?14:6,side>0?18:10);
    const source=loop.map(i=>vertices[i]),centre=[0,0,0];
    for(const p of source)for(let a=0;a<3;a++)centre[a]+=p[a]/source.length;
    let previous=loop;
    // Authored glide: the shoulder rises to a high elbow, then the outer wing slopes down.
    // Each section is a closed, thin airfoil, not a separate feather/primitive.
    const sections=[
      [.16,.120,.14,.32,.28],[.29,.175,.13,.30,.18],
      [.38,.185,.105,.27,.14],[.49,.125,.060,.245,.11],
      [.61,.045,.000,.20,.09],[.72,-.050,-.070,.155,.07],
      [.81,-.130,-.150,.085,.05]
    ];
    for(const [span,y,leading,chord,thickness] of sections){
      const next=source.map(p=>{
        const t=(stations[5][0]-p[2])/(stations[5][0]-stations[9][0]);
        const z=leading-t*chord;
        return vertex([side*span+(p[0]-centre[0])*.12,
          y+(p[1]-centre[1])*thickness+(z-leading+chord*.5)*.22,z],wingWeights(span,side));
      });
      bridge(previous,next,side>0?'wing_right':'wing_left');previous=next;
    }
    const end=vertex([side*.86,-.16,-.245],[[side>0?2:4,1]]);
    close(previous,end,side>0?'wing_right':'wing_left');
    // Tucked feet are short continuations of the underside, attached to body skin.
    const foot=patchBoundary(8,9,side>0?13:10,side>0?14:11);
    const mid=foot.map(i=>{const p=vertices[i];return vertex([p[0]*.6,p[1]-.025,p[2]-.015],[[0,1]]);});
    bridge(foot,mid,'feet');close(mid,vertex([side*.025,-.145,-.21],[[0,1]]),'feet');
  }
  // Small dark eye patches, inset in the same shell rather than extra eyeball meshes.
  for(const j of [0,7]){
    const k=cells[3][j],face=polygons[k],points=face.ids.map(i=>vertices[i]),centre=[0,0,0];
    for(const p of points)for(let a=0;a<3;a++)centre[a]+=p[a]/4;
    const inner=points.map(p=>vertex(p.map((n,a)=>centre[a]+(n-centre[a])*.38),[[0,1]]));
    polygons[k]=null;
    for(let n=0;n<4;n++)polygons.push({ids:[face.ids[n],face.ids[(n+1)%4],inner[(n+1)%4],inner[n]],tag:'body'});
    polygons.push({ids:inner,tag:'eye'});
  }
  const triangles=[],faceTags=[];
  for(const f of polygons)if(f)for(let j=1;j+1<f.ids.length;j++){
    triangles.push(f.ids[0],f.ids[j],f.ids[j+1]);faceTags.push(f.tag);
  }
  // Remove the unused interiors of the replaced skin patches.
  const used=new Uint8Array(vertices.length),remap=new Uint16Array(vertices.length);
  for(const i of triangles)used[i]=1;
  let count=0;
  for(let i=0;i<vertices.length;i++)if(used[i]){remap[i]=count;vertices[count]=vertices[i];weights[count]=weights[i];count++;}
  vertices.length=weights.length=count;
  for(let i=0;i<triangles.length;i++)triangles[i]=remap[triangles[i]];
  // Propagate consistent winding over the complete connected shell.
  const edgeFaces=new Map();
  for(let f=0;f<triangles.length/3;f++)for(let k=0;k<3;k++){
    const a=triangles[f*3+k],b=triangles[f*3+(k+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
    if(!edgeFaces.has(key))edgeFaces.set(key,[]);edgeFaces.get(key).push([f,a,b]);
  }
  const flip=new Int8Array(triangles.length/3).fill(-1),pending=[0];flip[0]=0;
  for(let q=0;q<pending.length;q++){
    const f=pending[q];
    for(let k=0;k<3;k++){
      const a=triangles[f*3+k],b=triangles[f*3+(k+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
      for(const [g,u]of edgeFaces.get(key))if(g!==f&&flip[g]<0){flip[g]=flip[f]^(a===u?1:0);pending.push(g);}
    }
  }
  for(let f=0;f<flip.length;f++)if(flip[f])[triangles[f*3+1],triangles[f*3+2]]=[triangles[f*3+2],triangles[f*3+1]];
  let volume=0;
  for(let i=0;i<triangles.length;i+=3){const a=vertices[triangles[i]],b=vertices[triangles[i+1]],c=vertices[triangles[i+2]];volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
  if(volume<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  const hex=h=>[16,8,0].map(k=>((parseInt(h.slice(1),16)>>k)&255)/255);
  const palette={white:hex('#e4e6dd'),back:hex('#a2adb2'),wing:hex('#89979f'),underwing:hex('#d0d8d7'),tips:hex('#303a43'),eye:hex('#192129'),beak:hex('#cca044'),feet:hex('#b08b51')};
  const colors=new Float32Array(triangles.length*3);
  for(let f=0;f<faceTags.length;f++){
    const p=triangles.slice(f*3,f*3+3).map(i=>vertices[i]);
    const x=p.reduce((s,v)=>s+v[0],0)/3,z=p.reduce((s,v)=>s+v[2],0)/3;
    const a=p[1].map((n,k)=>n-p[0][k]),b=p[2].map((n,k)=>n-p[0][k]);
    const ny=a[2]*b[0]-a[0]*b[2],tag=faceTags[f];
    let col=palette.white;
    if(tag.startsWith('wing')){
      col=ny>0?palette.wing:palette.underwing;
      if(Math.abs(x)>.66)col=palette.tips;
      if(Math.abs(x)>.75&&Math.abs(x)<.81&&z>-.17&&z<-.12)col=palette.white;
    }else if(tag==='eye')col=palette.eye;
    else if(tag==='feet')col=palette.feet;
    else if(tag==='beak'||z>.236)col=palette.beak;
    else if(z<.1&&ny>0&&tag!=='tail')col=palette.back;
    const variation=tag==='eye'?1:.98+(f*17%7)*.006;
    for(let j=0;j<3;j++)for(let k=0;k<3;k++)colors[f*9+j*3+k]=col[k]*variation;
  }
  const boneIndices=new Uint8Array(vertices.length*2),boneWeights=new Float32Array(vertices.length*2);
  weights.forEach((w,i)=>w.forEach(([b,value],k)=>{boneIndices[i*2+k]=b;boneWeights[i*2+k]=value;}));
  return SEAGULL_SHAPE={positions:new Float32Array(vertices.flat()),triangles:new Uint16Array(triangles),colors,boneIndices,boneWeights,faceTags,vertexCount:vertices.length,triangleCount:triangles.length/3,bones:SEAGULL_BONES};
}

export function seagullSkin(shape=seagullShape()){
  return {shape,positions:shape.positions.slice(),matrices:Array.from({length:6},()=>new Float64Array(12)),local:new Float64Array(12),angles:new Float64Array(6),state:'glide',mix:0,mixFrom:0,switchTime:0};
}
function gullMultiplyAffine(out,a,b){
  for(let r=0;r<3;r++){const j=r*4;
    out[j]=a[j]*b[0]+a[j+1]*b[4]+a[j+2]*b[8];
    out[j+1]=a[j]*b[1]+a[j+1]*b[5]+a[j+2]*b[9];
    out[j+2]=a[j]*b[2]+a[j+1]*b[6]+a[j+2]*b[10];
    out[j+3]=a[j]*b[3]+a[j+1]*b[7]+a[j+2]*b[11]+a[j+3];
  }
}

// 'glide' is the exact authored reference silhouette. 'flap' drives inner/outer wings.
// Switches blend over transitionSeconds; use 0 for explicit pose sampling/scrubbing.
export function poseSeagullSkin(skin,seconds,state='glide',strength=1,cyclesPerSecond=2.1,transitionSeconds=.28){
  if(state!=='glide'&&state!=='flap')throw new RangeError("Seagull state must be 'flap' or 'glide'");
  if(state!==skin.state){skin.mixFrom=skin.mix;skin.switchTime=seconds;skin.state=state;}
  const target=state==='flap'?1:0,t=transitionSeconds>0?gullSmooth((seconds-skin.switchTime)/transitionSeconds):1;
  skin.mix=skin.mixFrom+(target-skin.mixFrom)*t;
  const amount=skin.mix*strength,p=seconds*Math.PI*2*cyclesPerSecond,a=skin.angles;
  a[0]=Math.sin(p+.5)*.025*amount;
  a[1]=Math.sin(p)*.64*amount;a[2]=Math.sin(p-.65)*.28*amount;
  a[3]=-a[1];a[4]=-a[2];a[5]=-Math.sin(p-.3)*.065*amount;
  const l=skin.local;
  for(let i=0;i<6;i++){
    const bone=SEAGULL_BONES[i],x=bone.pivot[0],y=bone.pivot[1],z=bone.pivot[2],c=Math.cos(a[i]),s=Math.sin(a[i]);
    l.fill(0);
    if(bone.axis==='x'){l[0]=1;l[5]=c;l[6]=-s;l[9]=s;l[10]=c;}
    else{l[0]=c;l[1]=-s;l[4]=s;l[5]=c;l[10]=1;}
    l[3]=x-l[0]*x-l[1]*y-l[2]*z;l[7]=y-l[4]*x-l[5]*y-l[6]*z;l[11]=z-l[8]*x-l[9]*y-l[10]*z;
    if(bone.parent<0)skin.matrices[i].set(l);else gullMultiplyAffine(skin.matrices[i],skin.matrices[bone.parent],l);
  }
  const {positions:rest,boneIndices:bi,boneWeights:bw}=skin.shape,out=skin.positions;
  for(let i=0;i<rest.length/3;i++){
    const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];let px=0,py=0,pz=0;
    for(let j=0;j<2;j++){const w=bw[i*2+j];if(w===0)continue;const m=skin.matrices[bi[i*2+j]];
      px+=w*(m[0]*x+m[1]*y+m[2]*z+m[3]);py+=w*(m[4]*x+m[5]*y+m[6]*z+m[7]);pz+=w*(m[8]*x+m[9]*y+m[10]*z+m[11]);
    }out[i*3]=px;out[i*3+1]=py;out[i*3+2]=pz;
  }
  return out;
}

export function makeSeagull(GFX,{material=null,phase=0}={}){
  const shape=seagullShape(),skin=seagullSkin(shape),geometry=new GFX.BufferGeometry();
  const position=new GFX.BufferAttribute(new Float32Array(shape.triangles.length*3),3);
  geometry.setAttribute('position',position);geometry.setAttribute('color',new GFX.BufferAttribute(shape.colors,3));
  const ownsMaterial=!material;
  material||=new GFX.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,metalness:0,side:GFX.DoubleSide});
  const mesh=new GFX.Mesh(geometry,material),g=new GFX.Group();mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;g.add(mesh);
  const gull={g,mesh,skin,position,phase,ownsMaterial};poseSeagull(gull,0,'glide');return gull;
}
export function poseSeagull(gull,seconds,state='glide',strength=1,cyclesPerSecond=2.1,transitionSeconds=.28){
  const p=poseSeagullSkin(gull.skin,seconds+gull.phase,state,strength,cyclesPerSecond,transitionSeconds),ids=gull.skin.shape.triangles,out=gull.position.array;
  for(let i=0;i<ids.length;i++){const k=ids[i]*3;out[i*3]=p[k];out[i*3+1]=p[k+1];out[i*3+2]=p[k+2];}
  gull.position.needsUpdate=true;return gull;
}
export function disposeSeagull(gull){if(gull.g.parent)gull.g.parent.remove(gull.g);gull.mesh.geometry.dispose();if(gull.ownsMaterial)gull.mesh.material.dispose();}
