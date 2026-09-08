const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const M = require("../cad-modules/rational-bezier-curves/rational-math.js");
const source = fs.readFileSync(require.resolve("../cad-modules/rational-bezier-curves/app.js"), "utf8");
function harness() {
  const nodes = new Map(), paths = [], labels = [];
  let currentPath=[];
  function node() { return { value:"", checked:false, dataset:{}, textContent:"", children:[], events:{},
    addEventListener(name,callback) { this.events[name]=callback; },
    replaceChildren(...children) { this.children=children; }, appendChild(child) { this.children.push(child); },
    fire(name) { this.events[name]({target:this}); } }; }
  for (const match of source.matchAll(/find\("([^"]+)"\)/g)) nodes.set(match[1],node());
  nodes.get("#radius").value="2"; nodes.get("#theta").value="60"; nodes.get("#parameter-u").value="0.5";
  const ctx={ setTransform(){}, clearRect(){paths.length=0;labels.length=0;}, beginPath(){currentPath=[];},
    moveTo(x,y){currentPath.push([x,y]);}, lineTo(x,y){currentPath.push([x,y]);},
    stroke(){paths.push(currentPath);}, setLineDash(){}, arc(x,y,r){assert.ok([x,y,r].every(Number.isFinite));}, fill(){},
    fillText(text){labels.push(text);}, measureText(text){return {width:text.length*8};} };
  const canvas=nodes.get("[data-projection-canvas]"); canvas.clientWidth=320;canvas.clientHeight=400;canvas.getContext=()=>ctx;
  const layers=["cone","plane","controls","rays","axes"].map(name=>Object.assign(node(),{dataset:{layer:name},checked:name!=="rays"}));
  const modes=["orbit","y"].map(name=>Object.assign(node(),{dataset:{view:name}}));
  const zooms=["0.85","1.18"].map(factor=>Object.assign(node(),{dataset:{zoom:factor}}));
  let labelState=false, viewMode, codeAngle;
  const view={update(){},updateParameter(){},setLayer(){},setLabels(value){labelState=value;},setView(value){viewMode=value;},zoom(){},dispose(){}};
  vm.runInNewContext(source, { window:{RationalBezierMath:M,RationalBezierThree:()=>view,
    RationalBezierCode:{update(model){codeAngle=model.degrees;}},addEventListener(){},devicePixelRatio:1},
    document:{querySelector:selector=>nodes.get(selector),createElement:node,
      querySelectorAll:selector=>selector==="[data-layer]"?layers:selector==="[data-view]"?modes:selector==="[data-zoom]"?zooms:[]},
    ResizeObserver:class{observe(){}disconnect(){}} });
  return {nodes,paths,labels,layers,modes,get labelState(){return labelState;},get viewMode(){return viewMode;},get codeAngle(){return codeAngle;}};
}
test("full angle slider keeps the 2D circle fixed and shows singular readouts",()=>{
  const h=harness(); const reference=JSON.stringify(h.paths.find(p=>p.length===161));
  for(const angle of [0,60,89,90,91,120,179,180]) {
    const input=h.nodes.get("#theta"); input.value=String(angle);input.fire("input");
    assert.equal(JSON.stringify(h.paths.find(p=>p.length===161)),reference);
    assert.equal(h.codeAngle,angle);
    if(angle===90) assert.match(h.nodes.get("[data-controls-table]").children[1].children[2].textContent,/infinity/);
    if(angle===180) assert.match(h.nodes.get("[data-projected]").textContent,/Undefined/);
  }
});
test("label toggle affects both views, reset declutters, and y-view button is wired",()=>{
  const h=harness(), toggle=h.nodes.get("[data-show-labels]");
  assert.ok(!h.labels.includes("p₀"));
  toggle.checked=true;toggle.fire("change");assert.ok(h.labelState);assert.ok(h.labels.includes("p₀"));
  h.modes[1].fire("click");assert.equal(h.viewMode,"y");
  h.nodes.get("[data-reset]").fire("click");
  assert.equal(h.labelState,false);assert.ok(!h.labels.includes("p₀"));
  assert.equal(h.layers.find(input=>input.dataset.layer==="rays").checked,false);
});
