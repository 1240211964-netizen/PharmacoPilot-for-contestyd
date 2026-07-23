(function(){"use strict";const Y={domain:window.WENDAO_DOMAIN||document.body?.dataset?.wendaoDomain||"demo.libsp.net",agentId:"6ab7fb8c-1c28-11f1-a6d8-fa163f5838c7",modelId:"11609df7-fee9-11ef-a29b-d039570c2aae"};function h(){return window.WENDAO_DOMAIN||document.body?.dataset?.wendaoDomain||Y.domain}function B(A={}){const q=A.kind||"history",_=`https://${A.domain||h()}/api/openAccess/redirect/${q}`,D=new URLSearchParams;return q==="history"?(D.set("agentId",A.agentId||Y.agentId),D.set("modelId",A.modelId||Y.modelId),D.set("hd","1,1"),A.searchText&&D.set("searchText",A.searchText),A.internetSearch&&D.set("internet_search","true")):q==="home"?(D.set("hd","0,1,1"),D.set("select_agent_id",A.agentId||Y.agentId)):q==="search_history"?D.set("hd","1,1,1"):q==="deep_research_history"?(D.set("hd","0,1,1"),A.applicationId&&D.set("applicationId",A.applicationId),A.searchText&&D.set("searchText",A.searchText)):D.set("hd","1,1"),`${_}?${D.toString()}`}function N(A){const q=B(A),M=typeof window.showDemoToast=="function"?window.showDemoToast:null;if(/^demo\./.test(A?.domain||h())){M&&M("闻道学术检索 · 演示环境未接入院校平台（部署时注入校内域名即可启用）");return}const _=window.open(q,"_blank","noopener,noreferrer");M&&M("正在打开「闻道」学术检索平台（新页面）…"),_||console.warn("[wendao] window.open 返回 null（noopener 下属正常，无法据此判断拦截）:",q)}function v(A){if(A.dataset.wendaoUpgraded)return;A.dataset.wendaoUpgraded="1",A.classList.add("cmdbar-wendao"),A.innerHTML="";const q=document.createElement("form");q.className="cmdbar-form",q.setAttribute("role","search"),q.action="#";const M=document.createElement("span");M.className="cmdbar-brand",M.innerHTML='<span class="cmdbar-brand-dot" aria-hidden="true"></span>问问闻道';const _=document.createElement("span");_.className="cmdbar-sep",_.setAttribute("aria-hidden","true");const D=document.createElement("input");D.type="search",D.className="cmdbar-input",D.placeholder="",D.setAttribute("aria-label","问问闻道：在闻道学术服务平台中检索"),D.autocomplete="off";const W=document.createElement("kbd");W.textContent="⌘K",q.appendChild(M),q.appendChild(D),q.appendChild(W),A.appendChild(q),A.addEventListener("click",R=>{R.target!==D&&D.focus()}),q.addEventListener("submit",R=>{R.preventDefault();const J=D.value.trim();N(J?{kind:"history",searchText:J}:{kind:"home"})})}function l(){document.querySelectorAll(".cmdbar").forEach(v)}function w(A){const q=A.getAttribute("data-wendao-query");if(q)return q.trim();const M=A.getAttribute("data-wendao-source");if(M){const W=document.querySelector(M);if(W&&"value"in W)return String(W.value||"").trim();if(W)return(W.textContent||"").trim()}const D=A.closest(".wenda-c, section, .card, body")?.querySelector("[data-wendao='textarea'], textarea");return D?String(D.value||"").trim():""}function u(){document.addEventListener("click",A=>{const q=A.target.closest("[data-wendao]");if(!q)return;const M=q.getAttribute("data-wendao");if(M==="launch"){A.preventDefault();const _=w(q);N(_?{kind:"history",searchText:_}:{kind:"home"});return}if(M==="home"){A.preventDefault(),N({kind:"home"});return}if(M==="chip"){A.preventDefault();const D=q.closest(".wenda-c, section, .card, body")?.querySelector("[data-wendao='textarea'], textarea");if(!D)return;const W=(q.textContent||"").trim(),R=String(D.value||"");R.includes(`#${W}`)?D.value=R.replace(new RegExp(`\\s*#${W}`,"g"),"").trim():D.value=(R?R.trim()+"  ":"")+`#${W}`,D.focus();return}}),document.addEventListener("keydown",A=>{if(A.key!=="Enter"||!(A.metaKey||A.ctrlKey))return;const q=A.target.closest("[data-wendao='textarea'], textarea");if(!q||!q.closest(".wenda-c, [data-wendao-host]"))return;A.preventDefault();const M=String(q.value||"").trim();N(M?{kind:"history",searchText:M}:{kind:"home"})})}function F(){document.addEventListener("keydown",A=>{if(!(A.key==="k"||A.key==="K")||!(A.metaKey||A.ctrlKey))return;const M=document.querySelector(".cmdbar .cmdbar-input");M&&(A.preventDefault(),M.focus(),M.select?.())})}function I(){l(),F(),u()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",I,{once:!0}):I(),window.WENDAO={urlFor:B,openWendao:N,getDomain:h,DEFAULTS:Y}})(),function(){"use strict";const Y="https://demo.fanya.chaoxing.com/portal";function h(w){return w?.getAttribute?.("data-fanya-url")||window.FANYA_URL||document.body?.dataset?.fanyaUrl||Y}function B(w){const u=h(w);if(/^https:\/\/demo\./.test(u)){typeof window.showDemoToast=="function"&&window.showDemoToast("泛雅工作台 · 演示环境未接入院校平台（部署时注入课程 URL 即可启用）");return}window.open(u,"_blank","noopener,noreferrer")}function N(){document.querySelectorAll(".masthead-inner .pill-cap.fill").forEach(w=>{w.hasAttribute("data-fanya")||w.setAttribute("data-fanya",""),w.title="在泛雅平台中打开课程工作台"})}function v(){document.addEventListener("click",w=>{const u=w.target.closest("[data-fanya]");u&&(w.preventDefault(),B(u))})}function l(){N(),v()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",l,{once:!0}):l(),window.FANYA={openFanya:B,getUrl:h,DEFAULT_URL:Y}}(),function(){"use strict";function Y(u){return String(u).padStart(2,"0")}function h(u){return Y(Math.floor(u/60))+":"+Y(u%60)}function B(){document.querySelectorAll('[data-live="teachers"]').forEach(u=>{const F=Number(u.dataset.baseline||1);u.textContent=String(F)})}function N(){document.querySelectorAll('[data-live="ticker"]').forEach(u=>{const F=Number(u.dataset.min||0),I=Number(u.dataset.max||999);let q=(Number(u.textContent)||F)+(Math.random()<.55?1:0);q>I&&(q=F+Math.floor((I-F)/2)),u.textContent=String(q)})}function v(){document.querySelectorAll('[data-live="timer"]').forEach(u=>{const F=Number(u.dataset.start||0),I=Number(u.dataset.cap||1/0);let A=F;u.textContent=h(A),setInterval(()=>{A=Math.min(A+1,I),u.textContent=h(A)},1e3)})}function l(){if(typeof BroadcastChannel>"u")return!1;const u=new BroadcastChannel("pp-live-teachers"),F=Math.random().toString(36).slice(2)+"-"+Date.now(),I=new Map;I.set(F,Date.now());const A=8e3,q=2800;function M(W){document.querySelectorAll('[data-live="teachers"]').forEach(R=>{R.textContent!==String(W)&&(R.textContent=String(W),R.style.transition="opacity .35s",R.style.opacity="0.5",setTimeout(()=>{R.style.opacity="1"},120))})}function _(){const W=Date.now()-A;for(const[R,J]of I)R!==F&&J<W&&I.delete(R);M(I.size)}function D(W){u.postMessage({kind:W||"hi",id:F,t:Date.now()})}return u.onmessage=W=>{const R=W.data||{};if(!(!R.id||R.id===F)){if(R.kind==="bye"){I.delete(R.id),_();return}I.set(R.id,R.t||Date.now()),R.kind==="hi"&&D("ack"),_()}},D("hi"),setInterval(()=>{I.set(F,Date.now()),D("ping"),_()},q),window.addEventListener("beforeunload",()=>D("bye")),document.addEventListener("visibilitychange",()=>{document.hidden||D("ping")}),M(1),!0}function w(){v(),l()||B(),setInterval(N,6800)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",w,{once:!0}):w()}(),function(){"use strict";const Y=`
.demo-toast {
  position: fixed; left: 50%; bottom: 32px;
  transform: translateX(-50%) translateY(20px);
  background: var(--ink, #1a1714); color: var(--ivory, #fffdf7);
  padding: 11px 20px 11px 16px; border-radius: 999px;
  font-family: var(--serif-cn); font-size: var(--fs-sm);
  line-height: 1.2;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  opacity: 0; pointer-events: none;
  transition: opacity .25s ease, transform .25s ease;
  z-index: 9999;
  display: inline-flex; align-items: center; gap: 10px;
  max-width: 90vw;
}
.demo-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.demo-toast::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: var(--amber-deep, #a8492a);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--amber-deep, #a8492a) 28%, transparent);
  flex-shrink: 0;
}
`,h=document.createElement("style");h.textContent=Y,document.head.appendChild(h);let B=null,N=null;function v(u){B||(B=document.createElement("div"),B.className="demo-toast",B.setAttribute("role","status"),B.setAttribute("aria-live","polite"),document.body.appendChild(B)),B.textContent=u||"功能接入中",requestAnimationFrame(()=>B.classList.add("show")),clearTimeout(N),N=setTimeout(()=>{B.classList.remove("show")},2400)}window.showDemoToast=v;const l=`# 节点 05 · 内容 · 问题链
> （示例文件 · 用于展示导出格式；工作台内导出为当前节点实际内容）

节点: 05 / 11  ·  阶段: 课前
课程: 药事管理 · SWOT 分析
时长: 45 分钟
session: #3417

## 学习目标
- 学生能在 25 分钟内基于政策原文形成至少一个有据可依的立场
- 学生能识别 2-3 处典型的"分歧锚点"并加以解释

## 问题链 v0.1（4-6 题，含 2-3 个分歧锚）
1. 2024 国家医保谈判中，抗肿瘤药品准入条件的核心变化是什么？
2. 从 SWOT 视角看，这一变化对二级公立医院的优势/劣势分别是什么？
3. (分歧锚 ▲) 某医院的抗肿瘤药占比已超出当地预算指标，临床药师是否应主动建议替代方案？
4. (分歧锚 ▲) 替代方案如果意味着更高的住院成本，应如何向患者解释？
5. 在你所在的科室，谁是这场谈判结果的"第一执行人"？

## 评价证据
- 学生发言占比 ≥ 55%
- 至少 2 名学生引用政策原文
- 每个分歧锚至少出现 1 次真实分歧

## 下一站
05 · 案例 — 引入处方场景，把问题链转化为可演练任务

---
PharmacoPilot · plan.md 导出
`;function w(u){let F=u&&String(u).trim()||"plan.md";/\.md$/i.test(F)||(F+=".md");const I=new Blob([l],{type:"text/markdown;charset=utf-8"}),A=URL.createObjectURL(I),q=document.createElement("a");q.href=A,q.download=F,document.body.appendChild(q),q.click(),q.remove(),setTimeout(()=>URL.revokeObjectURL(A),1e3),v("已下载 "+F)}window.downloadDemoPlan=w,document.addEventListener("click",u=>{const F=u.target.closest("[data-demo-download]");if(F){u.preventDefault(),w(F.getAttribute("data-plan-name"));return}const I=u.target.closest("[data-demo-toast]");if(I){u.preventDefault(),v(I.getAttribute("data-demo-toast"));return}})}(),function(){"use strict";if(document.getElementById("faq"))return;const Y=`
.faq-list { margin-top: 4px; }
.faq-item {
  display: grid; grid-template-columns: 0.6fr 1.4fr; gap: 48px;
  padding: 26px 0; border-bottom: 1px solid var(--rule);
}
.faq-item:first-child { border-top: 1px solid var(--rule); }
.faq-num {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--mute); padding-top: 8px;
}
.faq-block { width: 100%; }
.faq-q {
  cursor: pointer; list-style: none; outline: none;
  font-family: var(--serif-cn); font-size: var(--fs-lg); font-weight: 500;
  color: var(--ink); line-height: 1.45;
  display: flex; align-items: baseline; justify-content: space-between; gap: 18px;
}
.faq-q::-webkit-details-marker { display: none; }
.faq-toggle {
  font-family: var(--mono); color: var(--amber-deep);
  font-size: var(--fs-lg); flex-shrink: 0; line-height: 1; padding-top: 2px;
  transition: transform .2s ease;
}
.faq-block[open] .faq-toggle { transform: rotate(45deg); }
.faq-a {
  font-family: var(--serif-cn); font-size: var(--fs-sm); line-height: 1.85;
  color: var(--ink-soft); margin: 14px 0 2px; max-width: 660px;
}
.faq-a i, .faq-a em {
  font-family: var(--serif-en); font-style: italic;
  color: var(--amber-deep); font-weight: 500;
}
.faq-a a {
  color: var(--ink); border-bottom: 1px solid var(--amber-deep);
  text-decoration: none; padding-bottom: 1px;
}
.faq-a a:hover { color: var(--amber-deep); }

body.dx-bench .faq-item { padding: 18px 0; gap: 28px; }
body.dx-bench .faq-q { font-size: var(--fs-lg); }
body.dx-bench .faq-a { font-size: var(--fs-sm); line-height: 1.75; }
body.dx-mag .faq-item { padding: 34px 0; }
body.dx-mag .faq-q { font-size: var(--fs-xl); }
body.dx-mag .faq-a { font-size: var(--fs-md); }

@media (max-width: 900px) {
  .faq-item { grid-template-columns: 1fr; gap: 6px; }
  .faq-num { padding-top: 0; }
}

.faq-dialog {
  border: none; padding: 0;
  width: min(880px, 92vw); max-width: none;
  max-height: 86vh;
  background: var(--paper); color: var(--ink);
  border-radius: 14px;
  box-shadow: 0 30px 80px -20px rgba(27, 25, 22, .45),
              0 0 0 1px rgba(27, 25, 22, .06);
  overflow: hidden;
}
.faq-dialog::backdrop {
  background: rgba(27, 25, 22, .55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.faq-dialog-inner {
  display: flex; flex-direction: column;
  max-height: 86vh;
}
.faq-dialog-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 24px; padding: 26px 32px 22px;
  border-bottom: 1px solid var(--rule);
  flex-shrink: 0;
}
.faq-dialog-eyebrow {
  font-family: var(--mono); font-size: var(--fs-2xs);
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--mute); margin-bottom: 6px;
}
.faq-dialog-title {
  font-family: var(--serif-cn); font-size: var(--fs-2xl); font-weight: 500;
  margin: 0; line-height: 1.25; letter-spacing: -0.005em;
}
.faq-dialog-title .it {
  font-family: var(--serif-en); font-style: italic; color: var(--amber-deep);
}
.faq-dialog-close {
  font-family: var(--mono); font-size: var(--fs-xl); line-height: 1;
  width: 36px; height: 36px; padding: 0;
  border: 1px solid var(--rule-2); border-radius: 50%;
  background: transparent; color: var(--ink-soft);
  cursor: pointer; flex-shrink: 0;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.faq-dialog-close:hover {
  background: var(--paper-2); border-color: var(--ink); color: var(--ink);
}
.faq-dialog .faq-list { padding: 4px 32px 28px; overflow-y: auto; margin-top: 0; }
.faq-dialog .faq-item { grid-template-columns: 0.45fr 1.55fr; gap: 28px; padding: 22px 0; }
.faq-dialog .faq-item:first-child { border-top: none; }
.faq-dialog .faq-item:last-child { border-bottom: none; }
.faq-dialog .faq-q { font-size: var(--fs-lg); }
.faq-dialog .faq-a { font-size: var(--fs-sm); }

@media (max-width: 700px) {
  .faq-dialog-head { padding: 20px 22px 16px; }
  .faq-dialog-title { font-size: var(--fs-xl); }
  .faq-dialog .faq-list { padding: 4px 22px 22px; }
  .faq-dialog .faq-item { grid-template-columns: 1fr; gap: 6px; padding: 18px 0; }
}
`,h=`
<div class="faq-dialog-inner">
  <header class="faq-dialog-head">
    <div>
      <div class="faq-dialog-eyebrow">FAQ · 常见问题</div>
      <h2 class="faq-dialog-title">常被问到的<span class="it">六个问题</span>。</h2>
    </div>
    <button class="faq-dialog-close" type="button" aria-label="关闭" data-faq-close>×</button>
  </header>
  <div class="faq-list">
    <div class="faq-item">
      <div class="faq-num">Q · 01</div>
      <details class="faq-block" open>
        <summary class="faq-q">PharmacoPilot 是什么？面向谁？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">面向药事管理本科课程的教学协作智能体，主要服务对象是高校新教师。把课程纲要、政策案例与临床场景，编织成可审校、可复用、可追溯的教学材料，与教师共同走完<i>设计 → 演练 → 评价</i>三段路径。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 02</div>
      <details class="faq-block">
        <summary class="faq-q">怎么防止"AI 一本正经地编"？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">三道闸：① <i>引用强制</i>——结论必须挂出处； ② <i>产物链校验</i>（纯代码、不调主 LLM）——上游变更触发下游 flag； ③ 每周 50 个测试场景的<i>离线 evals</i>，持续监控引用准确性与拒答边界。规则性工作走旁路，不掺到主对话里，错的地方好定位。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 03</div>
      <details class="faq-block">
        <summary class="faq-q">教师的判断会被 AI 取代吗？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">不会。架构里教师是 <i>Decision Agent</i>——不可替代的判断权。AI 输出始终落在"建议、材料、数据回流"上；每一站完成都需要教师签字，才能进下一站。AI 负责把碎活揽走，教师专心做关键教学判断。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 04</div>
      <details class="faq-block">
        <summary class="faq-q">数据从哪儿来？教学痕迹归谁？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">学术语料对接<i>闻道·科学探索</i>，模拟课堂对接<i>泛雅</i>，叠加自有案例库与量规库。教学痕迹按"班级-教师"维度持久化于 Postgres + 向量库，所有权归学校。跨教师跨班级仅以 embedding 形态复用，不暴露原始痕迹。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 05</div>
      <details class="faq-block">
        <summary class="faq-q">理论基础是什么？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a"><i>ADDIE × Backward Design × 建设性对齐（Biggs）× ICAP × ZPD × 认知负荷理论 × 教学评一体化（崔允漷）× 课例研究（顾泠沅）</i>。三个内页底栏均挂出对应 theory chip，可逐条溯源到原始文献。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 06</div>
      <details class="faq-block">
        <summary class="faq-q">怎么开始用？合作怎么走？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a"><i>所有页面无需登录即可浏览</i>，操作落在本机会话里，不写入真实数据库，可以放心点。要在自己学校落地、对接闻道与泛雅，请联系编辑部 <a href="mailto:editor@pharmacopilot.cn">editor@pharmacopilot.cn</a>，我们会安排接入账号与共建路径。</div>
      </details>
    </div>
  </div>
</div>
`,B=document.createElement("style");B.textContent=Y,document.head.appendChild(B);const N=document.createElement("dialog");if(N.id="faq",N.className="faq-dialog",N.setAttribute("aria-label","常见问题"),N.innerHTML=h,document.body.appendChild(N),typeof N.showModal!="function")return;function v(){N.open||N.showModal()}document.addEventListener("click",function(l){if(l.target.closest('a[href="#faq"]')){l.preventDefault(),v();return}if(l.target.closest("[data-faq-close]")){N.close();return}l.target===N&&N.close()}),location.hash==="#faq"&&v()}(),function(h){const B="stages-v4",N=[{id:"pre",title:"课前设计与准备",subtitle:"把课程、学生、议程、目标、内容与材料准备清楚。",stationIds:[1,2,3,4,5,6],outputPackage:"教学设计包",colorToken:"accent"},{id:"in",title:"课中实施与调控",subtitle:"把课堂活动、学生探究、形成性评价机制与即时反馈设计清楚。",stationIds:[7,8,9],outputPackage:"课堂实施包",colorToken:"sage"},{id:"post",title:"课后评价与改进",subtitle:"把学生作品、评价反馈、议程兑现度与教学资产沉淀清楚。",stationIds:[10,11],outputPackage:"评价迭代包",colorToken:"blue"}],v=[{id:"pharmacy-service",title:"药事服务管理",subtitle:"慢病服务、药师角色、患者需求、服务质量。",evidenceBoundary:"服务流程、患者需求、药师能力、患者安全与质量管理边界。"},{id:"insurance-access",title:"医保支付与可及性",subtitle:"政策目标、支付边界、患者负担、资源配置。",evidenceBoundary:"医保政策、支付约束、药物经济性、患者负担与利益相关者立场。"},{id:"regulatory-compliance",title:"监管合规风险",subtitle:"处方审核、药师在岗、宣传边界、质量安全。",evidenceBoundary:"监管要求、处方流程、人员资质、宣传合规与患者安全风险。"},{id:"drug-operation",title:"药品经营与组织管理",subtitle:"库存、供应链、门店绩效、服务能力。",evidenceBoundary:"品类结构、供应链稳定性、门店资源、药师服务能力与竞争环境。"}],l=[{id:"alignment",label:"目标—活动—评价一致性",shortLabel:"一致性",theory:"Backward Design / Constructive Alignment",diagnosticQuestion:"目标、活动、学生产出和评价证据是否指向同一类能力？"},{id:"authenticity",label:"药事管理情境真实性",shortLabel:"真实性",theory:"Authentic Learning",diagnosticQuestion:"案例是否嵌入真实或高仿真的药事管理问题？"},{id:"learner",label:"学情诊断与差异支持",shortLabel:"学情",theory:"UDL / Danielson Framework",diagnosticQuestion:"教学设计是否回应学生先备知识、常见误区和学习差异？"},{id:"cognition",label:"认知参与与高阶思维",shortLabel:"高阶",theory:"Bloom / ICAP",diagnosticQuestion:"课堂任务是否推动学生从理解走向应用、分析、评价和互动建构？"},{id:"assessment",label:"评价证据与反馈效度",shortLabel:"评价",theory:"Formative Assessment / Rubric",diagnosticQuestion:"评价和反馈能否解释学习目标达成并指导改进？"},{id:"improvement",label:"数据复盘与资产沉淀",shortLabel:"复盘",theory:"Learning Analytics / Reflective Practice",diagnosticQuestion:"是否能基于学生证据、低分维度和反馈语持续改进？"},{id:"experience",label:"学生前经验与连续性",shortLabel:"经验",theory:"Dewey / Experiential Continuity",diagnosticQuestion:"教学设计是否把学生的真实经验（实习、家人慢病、社区药店等）作为学习起点？"},{id:"agency",label:"学习者议程与主体性",shortLabel:"议程",theory:"Freire / Knowles / Andragogy",diagnosticQuestion:"学生是否在备课阶段有结构化的可见入口提出关切与议程？"},{id:"zpd",label:"动态学情与即时校准",shortLabel:"动态",theory:"Vygotsky / Dynamic Assessment",diagnosticQuestion:"课堂内是否有 3 个以上 ZPD 重新校准的学情触发锚点？"}],w=[{id:1,phase:"pre",title:"课程定位与目标分析",displayName:"课程定位与目标分析",userMindset:"这节课为什么教？服务什么药事管理能力？在整门课里它接什么、推什么？",what:"明确本节课在课程体系、专业能力培养和学生任务产出中的位置，写清它与前一节、下一节的承接关系。",why:"防止从“讲知识点”直接开始备课——先把这节课在整门课中的位置说清楚，避免讲完了与前后失联。",how:"查看“课程目标—药事任务—学生产出”定位图与“前一节—本节—下一节”上下文卡，选择定位类型，生成课程定位段落 + 课程位置说明。",evidenceFigure:"课程目标—药事任务—学生产出三角图 + 前后节承接上下文卡",decisionQuestion:"本节 SWOT 课最应该被定位为什么？",artifactType:"课程定位段落、课程位置说明",qualityDimensions:["alignment","authenticity"],backendCheckpoints:["教学情境","课程任务","专业能力","产出边界","课程位置"],v3Status:"upgraded",v3Note:"v2 节点 1 + 螺旋上下文卡"},{id:2,phase:"pre",title:"学情分析与经验起点",displayName:"学情分析与经验诊断室",userMindset:"学生进入本课时，认知和经验上分别带着什么？",what:"显性区分两类入口：认知前测（先备知识、误区、参与度）+ 经验入口（学生与药事现场的真实接触经历）。",why:"新教师常常只看学生'知道什么'，忽略他们'见过什么'。学生进入药事管理课时的家人慢病/实习/社区药店经历是学习的真实起点。",how:"查看认知前测分布图 + 学生经验图，识别认知和经验两类断层，生成学情分析、导学任务、诊断题、经验入口任务。",evidenceFigure:"前测分布图 / 误区结构条形图 / 学生药事经验图 / 参与度二维分群图",decisionQuestion:"本班进入案例探究前最需要处理的入口问题是什么？",artifactType:"学情分析段落、课前导学任务、诊断题、经验入口任务",qualityDimensions:["learner","assessment","experience"],backendCheckpoints:["学情分析","先备知识","常见误区","经验入口","预习任务","诊断题"],v3Status:"restructured",v3Note:"v2 节点 2 拆分：议程移到 v3 节点 3，新增经验入口维度"},{id:3,phase:"pre",title:"学习者议程协商",displayName:"学习者议程协商台",userMindset:"学生最想从这个案例里看清楚什么？哪里让他们觉得不太对劲？",what:"为学生在课前留一个可见的议程入口，让学生提出关切、质疑点、角色意愿，作为教师备课的真实输入。",why:"把学生当作可协商的合作者，而不只是被训练判断的对象——课前留一个可见的议程入口，让他们的关切先于教学预设进入备课。",how:"设计学习者议程协商单（3 个问题），收集学生回应，查看议程聚类雷达图，判断议程与教师预设目标之间的张力，生成议程—课堂动作映射表。",evidenceFigure:"学习者议程聚类雷达图 / 议程—预设张力矩阵 / 角色意愿分布图",decisionQuestion:"学习者议程与教师预设的目标之间，最大的张力是什么？",artifactType:"学习者议程协商单、议程—课堂动作映射表",qualityDimensions:["agency","experience","learner"],backendCheckpoints:["学习者议程","议程张力","角色意愿","议程兑现承诺"],v3Status:"new",v3Note:"v3 全新增。L2 学习者议程贯通的源头。"},{id:4,phase:"pre",title:"学习目标与评价证据",displayName:"目标—证据—量规",userMindset:"学生学完后要能做什么？怎么证明？目标如何同时回应定位、学情分析和学习者议程？",what:"把教学目标改写为可观察、可评价、可由学生产出证明的学习成果；同时回应来自前面三个环节的输入（课程定位、学情诊断、学习者议程）。",why:"目标若不回应学情和议程，再漂亮也是空的——这里强制让目标改写时同时回应前面三个环节(定位、学情低分项、学习者议程主张)。",how:"查看“目标—活动—产出—评价证据”矩阵 + 产出链顶卡（前序环节输入摘要），识别目标缺口和证据缺口，生成学习目标与评价证据表。",evidenceFigure:"目标—活动—产出—评价矩阵 / 认知层级分布图 / 证据覆盖热图",decisionQuestion:"当前目标设计最应补强哪一项？",artifactType:"学习目标表、目标—活动—评价证据对齐表",qualityDimensions:["alignment","assessment","cognition"],backendCheckpoints:["教学目标","学习成果","评价证据","目标对齐"],v3Status:"kept",v3Note:"v2 节点 3。新增产出链顶卡（节点 1/2/3 输入）。"},{id:5,phase:"pre",title:"学科内容结构化与问题链",displayName:"内容结构化与问题链工作台",userMindset:"教材内容怎么变成课堂问题链？",what:"把教材内容重构为问题链、概念链和任务链，帮助学生围绕真实问题推进学习。",why:"直接按教材顺序讲会退化为概念讲授；药事管理课堂应围绕事实、证据、判断、策略和风险组织内容。",how:"查看“教材内容—核心概念—问题链—学生任务”结构图，选择内容组织方式，生成课堂问题链和核心概念边界说明。",evidenceFigure:"概念网络图 / 问题链流程图 / 认知负荷热图",decisionQuestion:"本课内容重构的主线应是什么？",artifactType:"内容结构图、课堂问题链、核心概念边界说明",qualityDimensions:["alignment","learner","cognition"],backendCheckpoints:["核心概念","重点难点","问题链","认知负荷"],v3Status:"kept",v3Note:"v2 节点 4。新增产出链顶卡。"},{id:6,phase:"pre",title:"情境化案例与教学资源",displayName:"情境化案例资源室",userMindset:"药事管理案例、政策、数据、任务材料怎么准备？学习者议程里关心的伦理/政策点是否在材料里有对应证据？",what:"准备药事管理案例、政策材料、数据资料、任务单和证据模板；显式回应学习者议程里的伦理/政策关切。",why:"案例必须包含事实、政策、数据、利益相关者和风险边界。这里强制把学习者议程关切体现为可引用证据，避免议程被收集后束之高阁。",how:"查看案例证据密度图与议程对照表，判断材料中的事实、政策、数据、角色、风险边界与议程关切是否都有对应证据。",evidenceFigure:"案例证据密度图 / 材料来源矩阵 / 利益相关者关系图 / 证据链图 / 议程对照表",decisionQuestion:"案例材料最需要先处理什么问题？",artifactType:"案例材料说明、证据标注表、学生任务材料包、议程—证据对照表",qualityDimensions:["authenticity","assessment","agency"],backendCheckpoints:["案例材料","政策数据","证据模板","来源边界","议程兑现"],v3Status:"upgraded",v3Note:"v2 节点 5 + 议程兑现卡（L2 第 1 个回响点）。"},{id:7,phase:"in",title:"教学过程设计与节奏编排",displayName:"教学过程编排器",userMindset:"45 分钟课堂怎么展开？什么时候停下来看学生跟没跟上？",what:"设计课堂导入、概念支架、案例分析、小组展示、反馈修正和总结迁移的时间结构，并在时间线上预留至少 3 个'学情校准点'（看学生跟没跟上的关键时刻）。",why:"光定讲授/分析/协作比例还不够——课堂上必须预留具体时刻供教师停下来判断'学生跟上没有'，否则形成性评价无法在课中落地。",how:"查看 45 分钟课堂时间线图，调整讲授/分析/协作/反馈比例，并在时间线上显式标记至少 3 个学情校准点（前 1/3 / 中 1/3 / 后 1/3 各一）。",evidenceFigure:"课堂时间轴 / 参与层级图 / 活动—产出流向图",decisionQuestion:"45 分钟课堂最需要修正的结构问题是什么？",artifactType:"45 分钟课堂流程、活动—产出—评价节点表、3 个学情校准点位置",qualityDimensions:["alignment","cognition","assessment","zpd"],backendCheckpoints:["问题导入","概念支架","案例探究","展示总结","时间结构","学情校准点"],v3Status:"upgraded",v3Note:"v2 节点 6 + 3 ZPD 锚点（L1 锚点定义点）。"},{id:8,phase:"in",title:"探究式学习与协作任务",displayName:"探究协作工作室",userMindset:"学生如何分析、讨论、协作、产出？角色分配是否参考了学习者议程中的意愿？",what:"设计学生如何围绕药事管理案例进行事实提取、证据判断、小组协作和成果展示，角色分配参考学习者议程里的学生意愿。",why:"四角色任务（资料员/判断员/质询员/汇报员）若由教师强分，学生未必投入——让学生在议程里表达过的角色意愿成为分配参考。",how:"查看小组任务泳道图 + 学生角色意愿分布，判断每个小组角色是否有明确任务和产出，生成协作任务单和教师巡视提示。",evidenceFigure:"小组任务泳道图 / 案例证据链图 / 角色—产出矩阵 / 学生角色意愿分布",decisionQuestion:"小组协作最需要补强哪一项？",artifactType:"小组协作任务单、案例探究任务单、教师巡视与追问提示",qualityDimensions:["authenticity","cognition","learner","agency"],backendCheckpoints:["协作分工","角色任务","证据分析","教师巡视","展示追问","议程角色匹配"],v3Status:"upgraded",v3Note:"v2 节点 7 + 议程角色匹配（L2 第 3 个回响点）。"},{id:9,phase:"in",title:"形成性评价与动态调节",displayName:"形成性评价与动态调节台",userMindset:"课堂中如何用微评估重新校准学情？每个校准点的反馈—调节规则是什么？",what:"为时间线上预留的 3 个学情校准点设计微评估格式（≤ 3 min），并为每个点写一条“如果 X 则 Y”的反馈—调节规则。",why:"光设触发点不够——每个校准点必须有可执行的决策规则，教师才能在 1 分钟内判断'继续/暂停/重启'。",how:"查看形成性评价触发点曲线 + 3 个学情校准点位置，为每个点设计微评估格式与决策规则，生成学情触发—反馈—调节规则表。",evidenceFigure:"反馈触发点曲线 / 误区—反馈语匹配表 / 课堂风险预警卡 / 3 个学情校准点的学情触发设计",decisionQuestion:"3 个学情校准点中，哪个的学情触发—反馈规则最关键？",artifactType:"3 个学情校准点的学情触发—反馈—调节规则表、反馈语模板、课堂调节阈值",qualityDimensions:["assessment","learner","improvement","zpd"],backendCheckpoints:["课堂检查点","即时反馈","学习预警","教学调控","学情重新校准"],v3Status:"upgraded",v3Note:"v2 节点 8 升级。L1 形成性评价机制的设计点。"},{id:10,phase:"post",title:"表现性评价与反馈",displayName:"评价量规实验台",userMindset:"学生作品怎么评？反馈怎么写？",what:"用评价量规判断学生作品是否真正体现药事管理判断能力，并生成可行动反馈。",why:"学生作品可能格式完整但质量较低，例如缺少证据、分类错误、策略与分析不匹配或缺少风险边界。",how:"查看量规雷达图或低分维度分布图 + 产出链顶卡（学习目标 + 课中学情触发记录），判断作品主要问题，生成评价量规、评分说明和反馈语模板。",evidenceFigure:"量规雷达图 / 学生作品质量分布图 / 低分维度分布图",decisionQuestion:"表现性评价最应强调什么？",artifactType:"表现性评价量规、学生作品评分表、反馈语模板、二次修改要求",qualityDimensions:["assessment","alignment"],backendCheckpoints:["学生作品","评价量规","评分说明","反馈语","二次修改"],v3Status:"kept",v3Note:"v2 节点 9。新增产出链顶卡（节点 4 + 节点 9 输入）。"},{id:11,phase:"post",title:"教学反思与资源积累",displayName:"教学反思与资源库",userMindset:"这次课如何变成下一轮教学资产？学习者议程被兑现了多少？",what:"把学生作品、典型误区、低分维度、反馈语、案例材料和改进建议沉淀为下一轮教学资产；强制完成学习者议程兑现度回顾。",why:"学生在课前提出的议程关切，如果只是被'收集'但没在课后回顾兑现度，整条反馈闭环就断了——这里强制做一次'议程兑现回顾'。",how:"查看资产沉淀优先级图 + 议程兑现度回顾表，选择最值得保存的资产，生成教学复盘报告和资产沉淀清单。",evidenceFigure:"低分维度趋势图 / 资产沉淀网络图 / 下一轮改进优先级矩阵 / 议程兑现度回顾表",decisionQuestion:"复盘时最值得沉淀的资产是什么？",artifactType:"教学复盘报告（含议程兑现度回顾）、资产沉淀清单、下一轮改进计划",qualityDimensions:["improvement","assessment","agency"],backendCheckpoints:["数据复盘","教学反思","资源沉淀","下一轮改进","议程兑现度回顾"],v3Status:"upgraded",v3Note:"v2 节点 10 + 议程兑现度回顾（L2 闭环点）。"}],u=[{id:"L1",title:"形成性评价与 ZPD 动态评估",shortTitle:"动态评估",theory:"Vygotsky / Black & Wiliam",crossStations:[7,8,9],anchorStation:9,definitionStation:7,anchorCount:3,anchorFormat:"≤ 3 min 微评估（举手投票 / 错题快闪 / 典型作品口述 / 纸条提交 / 小组互判）",hardConstraint:"每个 ZPD 锚点必须有一条“如果 X 则 Y”的反馈—调节规则；否则节点 9 不允许通过。",uiHint:"节点 7 时间线上 ◇ 符号标记锚点；节点 9 顶部固定学情触发规则编辑器；节点 11 复盘显示锚点触发摘要。"},{id:"L2",title:"学习者议程贯通",shortTitle:"议程贯通",theory:"Freire / Knowles / Dewey",crossStations:[3,4,6,8,11],sourceStation:3,echoStations:[4,6,8,11],hardConstraint:"议程进入节点 4/6/8/11 时必须在产物模板里显式回应（可填可空，但留空会进入复盘风险列表）。",uiHint:"节点 3 完成后主导航上方出现橙色细条提示议程已加载；相关节点产出链顶卡附议程标签。"},{id:"L3",title:"学习产出链",shortTitle:"产出链",theory:"Wiggins & McTighe / UX 可发现性",crossStations:[1,2,3,4,5,6,7,8,9,10,11],hardConstraint:"每站顶卡 ≤ 3 行片段，可展开抽屉看完整上游产物；不允许堆所有内容。",uiHint:"灰底卡片在每站顶部固定；左侧 breadcrumb 显示「← 上一站 ・ 本节点 ・ 下一站 →」。"}],F={1:{inputsFrom:[],outputsTo:[4,7],topCardFromKeys:[],topCardToKeys:["定位类型","螺旋上下文"]},2:{inputsFrom:[1],outputsTo:[3,4],topCardFromKeys:["定位类型"],topCardToKeys:["最低指标项","经验入口任务"]},3:{inputsFrom:[2],outputsTo:[4,6,8,11],topCardFromKeys:["学情分析要点"],topCardToKeys:["学习者议程协商单"]},4:{inputsFrom:[1,2,3],outputsTo:[5,9,10],topCardFromKeys:["定位类型","学情低分项","议程主张"],topCardToKeys:["学习目标","评价证据表"]},5:{inputsFrom:[4],outputsTo:[6,7],topCardFromKeys:["学习目标"],topCardToKeys:["问题链","概念边界说明"]},6:{inputsFrom:[3,4,5],outputsTo:[8],topCardFromKeys:["议程","目标","问题链"],topCardToKeys:["案例材料","议程—证据对照表"]},7:{inputsFrom:[4,5],outputsTo:[8,9],topCardFromKeys:["目标","问题链"],topCardToKeys:["时间线","3 个 ZPD 锚点"]},8:{inputsFrom:[3,6,7],outputsTo:[9,10],topCardFromKeys:["议程意愿","案例","时间线"],topCardToKeys:["协作任务单","探究产出"]},9:{inputsFrom:[7,8],outputsTo:[11],topCardFromKeys:["锚点位置","探究产出"],topCardToKeys:["学情触发—反馈—调节规则"]},10:{inputsFrom:[4,8],outputsTo:[11],topCardFromKeys:["评价证据","学生作品"],topCardToKeys:["量规","评分","反馈语"]},11:{inputsFrom:[3,9,10],outputsTo:[],topCardFromKeys:["议程","学情触发记录","评价结果"],topCardToKeys:["复盘报告","资产清单","下一轮改进"]}},I=[{id:"S1",phase:"pre",title:"课程定位 · 学情诊断 · 学习者议程协商",displayName:"定位·学情·议程",tag:"诊断",pillClass:"pill-amber",keyDecision:"本节最大冲突点是什么？",learnObjective:"识别学生真实的认知与经验起点",doAction:"看前测 + 议程，定位本节最大冲突点",getDeliverable:"学情画像 + 议程协商单 + 锁定版课程定位",subNodeIds:[1,"2-3","1b"],iterationModel:"v0 草拟 → 学情议程综合诊断 → v1 回写修订",pharmacyContext:"药学生家人慢病比例 / 社区药店实习 / 一致性评价前测 / 集采伦理议程张力",theoryDrawer:["Bruner 螺旋课程","Dewey 经验连续性","Freire 问题提出","Knowles 成人学习"]},{id:"S2",phase:"pre",title:"学习目标—评价证据—量规对齐",displayName:"目标与量规",tag:"目标",pillClass:"pill-amber",keyDecision:"目标与量规第一应补强哪一项？",learnObjective:"把目标改成可观察、可评价的成果",doAction:"先写 3-5 条目标，再配 5 维量规",getDeliverable:"学习目标表 + 5 维量规",subNodeIds:["4-a","4-b"],iterationModel:"UbD 两段：目标（Stage 1）→ 评价证据 + 量规（Stage 2）",pharmacyContext:"药事管理决策能力目标 + 5 维量规（含批判意识维度）",theoryDrawer:["Wiggins & McTighe UbD","Anderson Bloom 修订版","Biggs 建设性对齐"],acceptsRubricRevision:{from:"S7",channelKey:"rubricRevision"}},{id:"S3",phase:"pre",title:"知识结构与关键误区定位",displayName:"知识与误区",tag:"知识",pillClass:"pill-amber",keyDecision:"学生最易卡在哪个误区？",learnObjective:"找出学生最易卡住的概念误区",doAction:"把教材重构为围绕误区的问题链",getDeliverable:"问题链 + 误区清单",subNodeIds:[5],pharmacyContext:"MAH / MA / 生产证概念边界 / 法规条文易混点",theoryDrawer:["Chi 概念变化","Shulman PCK"]},{id:"S4",phase:"pre",title:"真实药事管理案例与证据包",displayName:"案例与证据",tag:"案例",pillClass:"pill-amber",keyDecision:"议程关切对应的证据是否齐？",learnObjective:"把真实药事案例转化为证据包",doAction:"准备案例 + 核对每条议程都有证据",getDeliverable:"案例包 + 议程—证据对照表",subNodeIds:[6],pharmacyContext:"NMPA 文件 + 医保政策 + 药企财报 + 利益相关者立场",theoryDrawer:["Wiggins 真实性评价","Christensen 哈佛案例法","Lave & Wenger 情境学习"]},{id:"S5",phase:"pre",title:"课堂任务链与支架设计",displayName:"任务链设计",tag:"任务",pillClass:"pill-amber",keyDecision:"协作任务最应补强哪一项？",learnObjective:"用任务链 + 支架让学生主动参与",doAction:"先按经验排时间线 → 设计协作任务 → 基于任务复杂度回写时间线",getDeliverable:"锁定版时间线 + 协作任务单 + 3 个学情校准点位置",subNodeIds:[7,8,"7b"],iterationModel:"时间线 v0（经验值）→ 协作任务设计 → 时间线 v1 回写（基于任务复杂度调整）",pharmacyContext:"30 分钟实战段 / 4 角色（资料员 / 判断员 / 质询员 / 汇报员）/ 3 个 ZPD 锚点",theoryDrawer:["Chi ICAP","Vygotsky ZPD","Wood/Bruner 支架理论"]},{id:"S6",phase:"in",title:"课中学情捕捉与即时干预",displayName:"课中调控",tag:"课中",pillClass:"pill-sage",keyDecision:"本校准点的「如果 X 则 Y」规则是什么？",learnObjective:"用形成性评价实时校准课堂节奏",doAction:"为 3 个学情校准点分别写「如果 X 则 Y」反馈规则",getDeliverable:"3 条学情触发—反馈规则 + 反馈语模板",subNodeIds:["9-z1","9-z2","9-z3"],iterationModel:"Z1 条文测温 → Z2 推演投票 → Z3 知识封闭，每锚点独立编辑规则",pharmacyContext:"条文测温 / 推演投票 / 知识封闭测温 三类微评估",theoryDrawer:["Black & Wiliam 形成性评价","Feuerstein 动态评估"]},{id:"S7",phase:"post",title:"表现性评价与学生能力画像",displayName:"评价与画像",tag:"评价",pillClass:"pill-indigo",keyDecision:"下一轮要补强哪一维？",learnObjective:"把作品评分转化为可行动反馈，并把量规问题回写到「目标与量规」",doAction:"评分采集 → 反馈语与能力画像 → 量规反向修订",getDeliverable:"评分表 + 能力画像 + 反馈语 + 量规修订建议",subNodeIds:["10-a","10-b","10-c"],iterationModel:"数据采集（评分）→ 教学动作（反馈/画像）→ 元动作（量规修订回写 S2）",pharmacyContext:"5 维量规评分 / 低分维度 Pareto / 能力画像 / 反馈语模板 / 量规反修订建议",theoryDrawer:["Hattie 可见的学习","Hattie 反馈层级"],supportsRubricRevision:{to:"S2",channelKey:"rubricRevision"}},{id:"S8",phase:"post",title:"教师教学复盘与改进决策",displayName:"复盘与决策",tag:"复盘",pillClass:"pill-indigo",keyDecision:"下一轮第一改进项是什么？",learnObjective:"把课堂证据复盘为改进决策",doAction:"回顾议程兑现 + 定下一轮第 1 改进项",getDeliverable:"复盘报告 + 改进决策",subNodeIds:["11a"],pharmacyContext:"议程兑现回顾 + 学情触发摘要 + 学生作品低分诊断",theoryDrawer:["Schön 反思性实践","Kolb 经验学习圈"]},{id:"S9",phase:"post",title:"课例资产沉淀与知识库更新",displayName:"资产沉淀",tag:"资产",pillClass:"pill-indigo",keyDecision:"本轮最值得沉淀什么？",learnObjective:"把单次课例沉淀为可复用资产",doAction:"挑选并入库本轮最值得保存的资产",getDeliverable:"资产清单 + 知识库更新",subNodeIds:["11b"],pharmacyContext:"案例 v2 / 量规 v2 / 法规更新日志 / 学期末汇编",theoryDrawer:["Senge 学习型组织","Nonaka SECI 知识转化","Siemens 学习分析"]}],A={S1:"E01",S2:"E02",S3:"E03",S4:"E04",S5:"E05",S6:"E06",S7:"E07",S8:"E08",S9:"E09"},q=Object.fromEntries(Object.entries(A).map(([V,re])=>[re,V])),M={1:"E01",2:"E01",3:"E01",4:"E02",5:"E03",6:"E04",7:"E05",8:"E05",9:"E06",10:"E07",11:"E08"},_={E01:[1,2,3],E02:[4],E03:[5],E04:[6],E05:[7,8],E06:[9],E07:[10],E08:[11],E09:[11]},D={1:"E01",2:"E01",3:"E01","2-3":"E01","1b":"E01",4:"E02","4-a":"E02","4-b":"E02",5:"E03",6:"E04",7:"E05","7b":"E05",8:"E05",9:"E06","9-z1":"E06","9-z2":"E06","9-z3":"E06",10:"E07","10-a":"E07","10-b":"E07","10-c":"E07",11:"E08","11a":"E08","11b":"E09"};function W(V){return M[V]||null}function R(V){return _[V]||[]}function J(V){return A[V]||null}function X(V){return q[V]||null}function ce(V){return D[String(V)]||null}const ve={1:{stageId:"S1",subTitle:"课程定位",legacyStationId:1,order:1,revisionPass:"v0",subjectName:"课程定位"},2:{stageId:"S1",subTitle:"学情分析",legacyStationId:2,order:2,legacy:!0},3:{stageId:"S1",subTitle:"学习者议程协商",legacyStationId:3,order:3,legacy:!0},"2-3":{stageId:"S1",subTitle:"学情诊断 + 议程协商",legacyStationId:2,order:2,mergedWith:[3]},"1b":{stageId:"S1",subTitle:"再定位",legacyStationId:1,order:3,splitOf:1,revisionPass:"v1",subjectName:"课程定位",revisionSource:"学情诊断 + 议程协商",revisionAction:"确认或修订定位类型、能力锚定与产出边界，输出锁定版定位",enterCondition:{requires:[{subKey:"2-3",type:"judgmentSaved",reason:"v1 回写必须基于学情+议程合并诊断结果，否则等同于 v0 草拟"}],onUnmetUI:"节点 chip 显示锁定图标 + 提示「请先完成 2-3 学情议程合并诊断」"}},4:{stageId:"S2",subTitle:"学习目标与评价证据 + 量规设计",legacyStationId:4,order:1,legacy:!0},"4-a":{stageId:"S2",subTitle:"学习目标",legacyStationId:4,order:1,splitOf:4,focus:"objectives"},"4-b":{stageId:"S2",subTitle:"评价证据 + 5 维量规",legacyStationId:4,order:2,splitOf:4,focus:"rubric",acceptsRubricRevision:{from:"S7",channelKey:"rubricRevision"}},5:{stageId:"S3",subTitle:"知识结构与问题链",legacyStationId:5,order:1},6:{stageId:"S4",subTitle:"真实案例与证据包",legacyStationId:6,order:1},7:{stageId:"S5",subTitle:"课堂时间线",legacyStationId:7,order:1,revisionPass:"v0",subjectName:"课堂时间线"},8:{stageId:"S5",subTitle:"协作任务与角色分配",legacyStationId:8,order:2},"7b":{stageId:"S5",subTitle:"再校准时间线",legacyStationId:7,order:3,splitOf:7,revisionPass:"v1",subjectName:"课堂时间线",revisionSource:"协作任务与角色分配",revisionAction:"基于任务复杂度和角色任务量回写时间分配，调整 13 分钟微实战段配比与 3 个学情校准点位置",enterCondition:{requires:[{stationId:8,type:"judgmentSaved",reason:"v1 时间线回写必须读取协作任务设计的 4 角色任务密度与时间预算"}],onUnmetUI:"节点 chip 显示锁定图标 + 提示「请先完成协作任务与角色分配（节点 8）」"},readsFromStation:8},9:{stageId:"S6",subTitle:"课中学情触发与反馈",legacyStationId:9,order:1,legacy:!0},"9-z1":{stageId:"S6",subTitle:"Z1 · 条文测温（10'）",legacyStationId:9,order:1,splitOf:9,anchorId:"Z1"},"9-z2":{stageId:"S6",subTitle:"Z2 · 推演投票（28'）",legacyStationId:9,order:2,splitOf:9,anchorId:"Z2"},"9-z3":{stageId:"S6",subTitle:"Z3 · 知识封闭（42'）",legacyStationId:9,order:3,splitOf:9,anchorId:"Z3"},10:{stageId:"S7",subTitle:"表现性评价 + 量规反向修订",legacyStationId:10,order:1,legacy:!0},"10-a":{stageId:"S7",subTitle:"评分采集（5 维量规打分）",legacyStationId:10,order:1,splitOf:10,focus:"scoring"},"10-b":{stageId:"S7",subTitle:"反馈语 + 能力画像",legacyStationId:10,order:2,splitOf:10,focus:"feedback-profile"},"10-c":{stageId:"S7",subTitle:"量规反向修订",legacyStationId:10,order:3,splitOf:10,focus:"rubric-revision",supportsRubricRevision:{to:"S2",channelKey:"rubricRevision"}},"11a":{stageId:"S8",subTitle:"教师复盘与改进决策",legacyStationId:11,order:1,splitOf:11},"11b":{stageId:"S9",subTitle:"资产沉淀与知识库更新",legacyStationId:11,order:1,splitOf:11}},H={S1:{inputsFrom:[],outputsTo:["S2","S4","S5"],topCardFromKeys:[],topCardToKeys:["课程定位","学情低分项","议程张力"]},S2:{inputsFrom:["S1"],outputsTo:["S3","S5","S7"],topCardFromKeys:["定位","学情","议程"],topCardToKeys:["学习目标","评价证据","5 维量规"]},S3:{inputsFrom:["S2"],outputsTo:["S4","S5"],topCardFromKeys:["学习目标"],topCardToKeys:["概念边界","误区清单","问题链"]},S4:{inputsFrom:["S1","S2","S3"],outputsTo:["S5"],topCardFromKeys:["议程","目标","问题链"],topCardToKeys:["案例材料","议程—证据对照"]},S5:{inputsFrom:["S2","S3","S4"],outputsTo:["S6","S7"],topCardFromKeys:["目标","问题链","案例"],topCardToKeys:["时间线","学情校准点","协作任务单"]},S6:{inputsFrom:["S5"],outputsTo:["S7","S8"],topCardFromKeys:["锚点位置"],topCardToKeys:["学情触发—反馈—调节规则","触发记录"]},S7:{inputsFrom:["S2","S5","S6"],outputsTo:["S8"],revisionsTo:["S2"],topCardFromKeys:["量规","学生作品","学情触发数据"],topCardToKeys:["评分","能力画像"]},S8:{inputsFrom:["S1","S6","S7"],outputsTo:["S9"],topCardFromKeys:["议程兑现","学情触发摘要","评价结果"],topCardToKeys:["复盘报告","改进决策"]},S9:{inputsFrom:["S8"],outputsTo:[],topCardFromKeys:["改进决策"],topCardToKeys:["案例 v2","量规 v2","法规日志"]}},ge=[{id:"L1",title:"形成性评价与 ZPD 动态评估",shortTitle:"动态评估",theory:"Vygotsky / Black & Wiliam",crossStages:["S5","S6","S8"],definitionStage:"S5",anchorStage:"S6",summaryStage:"S8",anchorCount:3,anchorFormat:"≤ 3 min 微评估（举手投票 / 错题快闪 / 典型作品口述 / 纸条提交 / 小组互判）",hardConstraint:"每个 ZPD 锚点必须有一条「如果 X 则 Y」反馈—调节规则；S6 不允许在锚点规则为空时通过。",uiHint:"S5 内子节点 07 时间线上 ◇ 符号标记锚点；S6 顶部固定学情触发规则编辑器；S8 显示触发摘要。"},{id:"L2",title:"学习者议程贯通",shortTitle:"议程贯通",theory:"Freire / Knowles / Dewey",crossStages:["S1","S2","S4","S5","S8"],sourceStage:"S1",echoStages:["S2","S4","S5","S8"],hardConstraint:"议程进入 S2/S4/S5/S8 时必须在产物模板里显式回应；留空进入 S8 复盘风险列表。",uiHint:"S1 完成后主导航上方出现橙色细条；S2/S4/S5/S8 顶卡附议程标签。"},{id:"L3",title:"学习产出链",shortTitle:"产出链",theory:"Wiggins & McTighe / UX 可发现性",crossStages:["S1","S2","S3","S4","S5","S6","S7","S8","S9"],hardConstraint:"每个教学环节顶卡 ≤ 3 行片段，可展开抽屉看完整上游产物。",uiHint:"灰底卡片固定；breadcrumb 显示「教学环节 · 子节点」。"}],pe={from:"S7",to:"S2",purpose:"学生作品发现的量规维度问题（如某维度区分度不足、过度严格、缺失关键维度）可回写到教学环节 2 修订量规",payloadShape:{dim:"string",reason:"string",proposedChange:"string",evidenceArtifactId:"string?"},storeKey:"rubricRevisions",storeEvent:"rubric:revisionProposed",uiHint:"S7 评分完成后显示「向 S2 提出量规修订」按钮；S2 顶部显示「待审修订 N 条」徽章。",hardConstraint:"下一轮备课进入 S2 时，未处理的量规修订必须在量规设计前显式确认或驳回。"},ue={stationTemplate:["产出链顶卡：显示上一站产物片段 + 本节点要在哪些方面回应（L3 全站生效）","环节说明卡：是什么、为什么、用户如何做","证据图：展示可支持教学判断的数据、案例、目标、活动或评价证据","教学判断题：必须是教学决策题，不是知识问答题","系统反馈：解释判断合理性、风险和修正建议","产物生成：生成可写入教案、任务单、量规、反馈语或复盘清单的文本","保存资产：写入教学数据页或教学资产库"],artifactRequiredSections:["图表观察","教学判断","药事管理情境","课堂动作或评价动作","证据与资产沉淀"],horizontalLayerHooks:{L1_stage:"S5 定义 ZPD 锚点；S6 不允许在锚点决策规则为空时通过；S8 显示触发摘要。",L2_stage:"S2/S4/S5/S8 顶卡显式呈现议程标签；S8 强制完成议程兑现度回顾。",L3_stage:"9 个教学环节顶卡 + breadcrumb 全部展示产出链。",L1:"子节点 7/8/9 必须显式处理 ZPD 锚点；子节点 9 不允许在锚点决策规则为空时通过。",L2:"子节点 4/6/8/11 在产物模板中显式呈现议程标签；子节点 11 强制完成议程兑现度回顾。",L3:"所有子节点顶部固定产出链顶卡组件。"}},n={pageTitle:"面向新教师的药事管理课程教学导航工作台",pageSubtitle:"9 个教学环节 · 12 子节点 · 一节课的证据化设计、实施、复盘与沉淀。",forbiddenVisiblePhrases:["20环节教学模拟工作台","20环节教学导航路径","20个教学环节导航图","11 节点工作台","11 个并列节点","10 tiles","10 个节点","缩略图 10","0 / 11"],allowedTwentyStepUsage:"20 环节只允许作为后台质量检查点；前台暴露为「9 个教学环节 + 12 子节点」。",counterDisplayFormat:"{done} / 9",breadcrumbFormat:"{stageTitle} · {subNodeTitle}",stageTheoryDrawerLabel:"方法依据"},xe=["不得把前台改回 20 个可见环节。","不得把页面做成通用后台 dashboard。","不得把页面做成学生闯关游戏；服务对象是新教师。","不得增加大段前端说明文字；应由图表、判断题、反馈和产物驱动。","不得把 SWOT 当作产品总主题；它只是《管理学原理》中的示例知识点。","不得移除药事管理情境。","不得大改 app.js 或全局工程结构。","不得引入外部依赖；优先使用静态 HTML / CSS / 原生 JS / SVG。","不得让学习者议程站（子节点 3）退化为“学生意见调查表”；议程必须在至少 4 个回响点显式回应（S2/S4/S5/S8）。","不得让形成性评价机制（L1）退化为“随便提问几个学生”；每个 ZPD 锚点必须有“如果 X 则 Y”的决策规则。","不得在前台铺陈教育理论标签（如 ZPD / UbD / Bloom 等术语）；理论收进每个教学环节的「方法依据」抽屉。","不得让教学环节 7 的「量规反向修订」失效；学生作品发现的量规问题必须可回写到教学环节 2。","不得把横向机制（L1/L2/L3）退化为内部数据；议程横条 / 锚点 ◇ 标 / 顶卡产出链必须前台可见。","不得在前台出现「11 节点」「10 tiles」「0/11」等旧叙事；统一为「9 个教学环节 + 12 子节点」。"];function U(V){return Object.freeze(V),Object.getOwnPropertyNames(V).forEach(re=>{const de=V[re];de&&typeof de=="object"&&!Object.isFrozen(de)&&U(de)}),V}h.PharmacoPilotNavigationContract=U({VERSION:B,NAVIGATION_PHASES:N,NAV_STATIONS:w,PHARMACY_SCENARIOS:v,QUALITY_DIMENSIONS:l,INTERACTION_CONTRACT:ue,COPY_RULES:n,FORBIDDEN_CHANGES:xe,HORIZONTAL_LAYERS:u,PRODUCT_CHAIN:F,NAV_STAGES:I,SUB_NODES:ve,STAGE_CHAIN:H,STAGE_HORIZONTAL_LAYERS:ge,RUBRIC_REVISION:pe,STAGE_TO_ENV:A,ENV_TO_STAGE:q,STATION_TO_ENV:M,ENV_TO_STATIONS:_,SUB_NODES_TO_ENV:D,stationToEnv:W,envToStations:R,stageToEnv:J,envToStage:X,subNodeToEnv:ce})}(window),function(h){const B={1:[["comprehensive","综合决策型定位","贯通「病—证—管」四类决策。SWOT 是工具不是目的，主目标是循证决策训练——与课程主线一致。",3.8,{recommended:!0}],["research","证据研究型定位","强化文献检索与综述训练。若本班型偏研究方向可选；否则会让 SWOT 的判断属性被稀释。",3.4],["policy","政策治理型定位","与「集采常态化」情境契合，但会让 W/T 维分析过度政治化——SWOT 退化为政策辩论。",3.2],["service","服务运营型定位","贴近基层药学服务实务，但 SWOT 分析对象通常是企业不是门店——与本案例对象（华海药业）错位。",2.8]],2:[["evidence","学生会填表，但证据链表达不足","这是最容易被忽略的高风险问题，应前置证据引用训练。",3.7],["boundary","内部条件与外部环境边界混淆","需要通过正反例和判断流程卡澄清。",3.3],["participation","低参与学生无法进入任务","需要低门槛入口和小组角色支持。",3]],3:[["ethics","学生关心案例伦理边界，教师设计偏管理判断","建议在案例与证据环节 把伦理边界加入案例材料。",3.8],["policy","学生希望讨论政策合理性，教师定位是服务运营","建议在目标与量规环节 调整目标涵盖政策维度。",3.7],["align","学生议程与教师预设一致","保留议程作为课堂导入素材，提高 ownership。",3.2],["narrow","学生议程过于分散，需要教师收敛","过早收敛会削弱主体性，必须提示风险。",1.9]],4:[["evidence","为每个目标配置评价证据","最能建立目标、活动、产出和评价之间的闭环。",3.8],["verb","把「理解」改写为可观察行为","能减少空泛目标，是必要改进。",3.4],["more","增加更多目标以显得完整","目标过多会稀释课堂主线。",1.7]],5:[["chain","按「概念边界—证据判断—策略建议」组织","能把教材内容转化为学生可操作的问题链。",3.8],["textbook","按教材章节顺序逐段讲授","结构清楚，但容易退回概念讲授。",2.1],["all","尽量覆盖所有内容点","会显著增加认知负荷。",1.6]],6:[["agenda-fill","把未兑现的 2 条学生议程对应的证据补齐","命中 议程贯通硬约束。议程被采集却无证据对应，会让学习者议程 的协商承诺退化为「调查表」。",3.9,{recommended:!0,lintTriggers:["L2-uncovered"],v3New:!0}],["tag","为现有材料标注事实/政策/数据/角色/风险边界 5 类标签","能让学生每条判断都有证据来源；但当前更紧迫的是议程兑现。",3.4],["more","继续增加背景材料，让案例更丰满","材料越多不一定越好，证据图已显示 S/O/T 维 ≥70%，再加会压垮学生实战节奏。",1.9,{lintTriggers:["material-overload"]}],["answer","直接给出参考 SWOT 答案，降低学生难度","会削弱学生探究和论证，违反 contract「不得退化为知识问答」的禁条。",1.4,{lintTriggers:["forbidden-spoonfeed"],blockSave:!0}]],7:[["student","压缩讲授，增加证据分析和反馈修正时间","更符合高阶参与和形成性评价要求。",3.8],["lecture","延长教师讲授，保证内容覆盖","内容覆盖不等于学习发生。",1.8],["free","扩大自由讨论，弱化量规约束","讨论会热闹，但证据质量难保证。",2]],8:[["agenda-role-match","让学习者议程 的学生角色意愿成为本节角色分配的参考","命中议程贯通的第 3 个回响点。若学生表达「想演患者律师」却被随机分配，议程承诺落空。",3.9,{recommended:!0,lintTriggers:["L2-agenda-role-mismatch"],v3New:!0}],["roles","为每个角色（资料员/判断员/质询员/汇报员）设置独立证据产出","能避免小组讨论由少数学生包办；但若不联动议程意愿，仍可能错配。",3.4],["leader","指定组长完成主要任务","效率高但协作必要性不足，会让 3/4 学生失去证据产出机会。",1.8,{lintTriggers:["forbidden-leader-only"]}],["random","随机分组后自由讨论","灵活但过程证据薄弱，议程意愿被完全忽略。",2,{lintTriggers:["L2-agenda-role-mismatch"]}]],9:[["checkpoint","在案例探究前设置概念边界即时判断","能防止学生带着误区进入核心任务。",3.7],["after","课后再通过作业判断","反馈过晚，不能调节课堂。",1.8],["random","随机提问几名学生","有互动，但覆盖面和证据强度不足。",2]],10:[["rubric","按量规逐项对照学生证据评分","能保证评分解释性和反馈效度。",3.8],["format","主要看矩阵格式是否完整","形式完整不代表思维质量。",1.9],["impression","按小组展示印象给分","主观性过强，证据不足。",1.6]],11:[["asset","沉淀低分样例、反馈语和改进后的案例材料","能直接服务下一轮教学优化。",3.8],["plan","只保存最终教案","缺少学生证据和迭代依据。",2.1],["mood","只记录课堂气氛是否活跃","不能形成可验证改进。",1.6]]};h.PharmacoPilotDecisionBank=Object.freeze(B);const N={1:{transferAxis:"学习者群体",chain:[{step:1,kind:"observation",stem:"看「四类定位权重对比」条形图,权重最高的是哪一种定位?",options:[{key:"comprehensive",label:"综合决策型(82)",correct:!0},{key:"research",label:"证据研究型(64)",mistakeType:"misread"},{key:"policy",label:"政策治理型(56)",mistakeType:"misread"},{key:"service",label:"服务运营型(48)",mistakeType:"misread"}],hints:[{level:1,kind:"direction",text:"图里每种定位都有一个数值,对比一下,最大的是哪个?"},{level:2,kind:"contrast",text:"82 和 48 之间差了 34 个点——这种差距说明什么?"},{level:3,kind:"principle",text:"条形图里数值最高的那一项,就是当前所有证据最支持的定位。"},{level:4,kind:"answer",text:"答案是综合决策型(82)。它贯通「病—证—管」四类决策,与课程主线最匹配。"}]},{step:2,kind:"diagnosis",stem:"综合决策型为什么会拿到 82 分?根本原因是什么?",options:[{key:"form",label:"因为名字带「综合」二字,听上去最全面",mistakeType:"form-judgment",theorySource:"Berliner novice 阶段 · 用形式特征做决定"},{key:"alignment",label:"因为它最贴近课程目标「循证决策能力」(三角图里课程目标权重 0.40 最大)",correct:!0},{key:"object",label:"因为案例对象是药企,所以一定要选企业战略导向的定位",mistakeType:"single-cue-matching",theorySource:"Shulman PCK · 把 subject matter 误当成 PCK"},{key:"safe",label:"因为综合决策型覆盖面最广,选它最不容易出错",mistakeType:"overcoverage",theorySource:"Hammerness · 新教师贪多倾向"}],hints:[{level:1,kind:"direction",text:"三角图三个端点各自的权重是多少?和定位类型对应一下看看。"},{level:2,kind:"contrast",text:"如果只是名字带「综合」就拿高分,那为什么没有「综合服务型」「综合管理型」这种选项?"},{level:3,kind:"principle",text:"权重排序的依据是「与课程目标的匹配度」,不是名称、对象或顺序。"},{level:4,kind:"answer",text:"答案是 B。三角图里课程目标权重 0.40 最高,所以最贴近课程目标的定位拿到最高分。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清证据指向(Q1),也理解了为什么是这个指向(Q2)。现在你来拍板——",postSelectReflection:{prompt:"学生学完只会填 SWOT 4 个格子,你这节课算成功了吗?用一句话说明。",field:"swotRoleReflection",placeholder:"例：不算,因为他们没学会用 SWOT 做判断…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"学习者群体",stem:"假设下学期你要把这节课教给「社区药师在职培训班」(而不是药学专业研究生),你的定位选择会变吗?为什么?",scaffold:["学习者起点:在职药师 vs 研究生,已有经验有何不同?","学生产出形式:报告 vs 实战话术,哪个更合适?","课程目标:是否依然是「循证决策」?还是会偏向「门店实务」?"]}]},2:{transferAxis:"换班型",chain:[{step:1,kind:"observation",stem:"看「认知前测 4 题分布图」,4 道前测里学生最普遍卡住的是哪一题?",options:[{key:"q1",label:"Q1 · W 含义(65% 正确)",mistakeType:"misread"},{key:"q2",label:"Q2 · S/W 边界(32% 正确)",mistakeType:"misread"},{key:"q3",label:"Q3 · 内外来源(41% 正确)",mistakeType:"misread"},{key:"q4",label:"Q4 · S 与 T 并存(19% 正确)",correct:!0}],hints:[{level:1,kind:"direction",text:"条形图越短代表正确率越低,看哪一条最短?"},{level:2,kind:"contrast",text:"Q1 是 65% 正确,Q4 是 19% 正确——两者之间差了 46 个点,说明什么?"},{level:3,kind:"principle",text:"正确率最低的那一题,就是本班最普遍的认知断层。"},{level:4,kind:"answer",text:"答案是 Q4。仅 19% 正确率,远低于其他三题。"}]},{step:2,kind:"diagnosis",stem:"Q4「S 与 T 并存」只有 19% 正确率,说明本班的核心问题是什么?",options:[{key:"review",label:"学生没认真背概念,需要再讲一遍 SWOT 定义",mistakeType:"knowledge-gap-misread",theorySource:"Berliner novice 阶段 · 不区分「不知道」和「错误地知道」"},{key:"misconception",label:"学生存在「S 与 T 互斥」的概念误区,需要做边界训练",correct:!0},{key:"moral",label:"学生学习不认真,下节课加强课堂纪律和督促",mistakeType:"moral-attribution",theorySource:"新教师道德归因 · 把可教的认知问题归到不可教的态度问题"},{key:"general",label:"全班基础差,整节课难度都要降下来",mistakeType:"overgeneralization",theorySource:"Hammerness · 单点扩展为全局判断"}],hints:[{level:1,kind:"direction",text:"看 Q4 数据右侧的注释——「高频误区」那一行写的是什么?"},{level:2,kind:"contrast",text:"如果是「没背概念」,那 65% 正确的 Q1 学生为什么背得动?"},{level:3,kind:"principle",text:"学情数据不是评估「学生能不能」,而是诊断「他们错在哪一种具体方式上」。低正确率背后通常有具体的认知误区,不是泛泛的「基础差」或「态度差」。"},{level:4,kind:"answer",text:"答案是 B。Q4 注释明确写了「38% 学生认为 S 与 T 互斥」——这是一个具体的概念误区,可以通过边界训练直接干预。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清最严峻的认知断层(Q1),也理解了它背后是一个具体的概念误区而不是泛泛的「基础差」(Q2)。现在你来拍板——",postSelectReflection:{prompt:"学生交上来的 SWOT 表 4 个格子都填对了,但每条判断都没写证据来源——你愿意把这种作业当成「达标」吗?用一句话说明。",field:"evidenceLinkReflection",placeholder:"例：不愿意,没有证据的 SWOT 判断只是猜测…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换班型",stem:"假设你下学期把这节课教给「成人药师在职班」(已经在岗 2-3 年的执业药师),本班最严峻的两个学情信号——Q4 概念误区 + 12% 零经验——会怎么变?你原来排第一的「证据链训练」还排第一吗?",scaffold:["认知前测:在职药师对 SWOT 概念的熟悉度会变化在哪?","经验入口:12% 零经验会变成 0%(在职药师都有现场经验)吗?","优先级:原来排第一的「证据链训练」,在职班会被什么挤掉?"]}]},4:{transferAxis:"换班型",chain:[{step:1,kind:"observation",stem:"看「目标—活动—产出—评价 对齐矩阵」4 维评分,得分最低、最需补强的是哪一维?",options:[{key:"behavior",label:"可观察行为 (58, warn)",mistakeType:"misread"},{key:"evidence",label:"评价证据完整度 (62, warn)",mistakeType:"misread"},{key:"bloom",label:"Bloom 层级覆盖 (72, ok)",mistakeType:"misread"},{key:"agenda-echo",label:"对前序环节回应度 (44, miss)",correct:!0}],hints:[{level:1,kind:"direction",text:"看 4 维右侧的 status,哪一维是 miss?"},{level:2,kind:"contrast",text:"72 vs 44,差了 28 个点——这意味着什么?"},{level:3,kind:"principle",text:"最低分维度就是目标设计最薄弱的环节。"},{level:4,kind:"answer",text:"答案是 D。对前序环节回应度 44%——议程没被显式映射到目标。"}]},{step:2,kind:"diagnosis",stem:"「对前序环节回应度」44 分最低,意味着目标设计的核心问题是什么?",options:[{key:"agenda-broken",label:"学生议程没有被显式映射到学习目标,议程承诺断尾",correct:!0},{key:"more-goals",label:"目标数量太少了,要再加几条",mistakeType:"overcoverage",theorySource:"Hammerness · 贪多倾向"},{key:"verb-only",label:"目标动词写得不好,要全部改写动词",mistakeType:"single-cue",theorySource:"Shulman PCK · 把多元问题误归为单一动词问题"},{key:"ignore-prior",label:"前序环节的数据不准,不必管它",mistakeType:"process-blindness",theorySource:"新教师过程盲点 · 否定前序输入的价值"}],hints:[{level:1,kind:"direction",text:"看 chainTopcard 的 inputsFrom,前序环节有哪些?定位/学情/议程的哪一类没被本节目标显式回应?"},{level:2,kind:"contrast",text:"如果是「目标少」,加几条就能解决吗?加完仍然不映射议程,问题依旧。"},{level:3,kind:"principle",text:"目标对前序环节的回应度 = 议程贯通的第 2 回响点。议程在 S1 被采集,目标若不映射,议程承诺就断尾了。"},{level:4,kind:"answer",text:"答案是 A。5 条议程未在学习目标中显式映射(如 ethics-pricing → 「能评价集采降价合理性边界」)——议程在 S2 断尾。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清目标设计最薄弱的维度(Q1),也理解了它是议程贯通断尾的根因(Q2)。现在你来拍板——",postSelectReflection:{prompt:"你课前收了 5 条议程,但学习目标里只字未提议程关切——你愿意让议程留在「调查表」里而不进入目标吗?用一句话说明。",field:"agendaIntoGoalReflection",placeholder:"例:不愿意,议程不进目标等于没收过…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换班型",stem:"假设下学期教成人药师在职班(已是执业药师),5 条议程会变(不会问入门级议程),你的学习目标改写策略还成立吗?Bloom 覆盖会怎么调?",scaffold:["议程内容:在职班可能换成什么张力?(医保实操 / 创新药临床应用 / 等)","目标动词:在职班的「能 + 动词」是不是要直接从「评价/创造」开始,跳过「理解」?","Bloom 覆盖:理解层是否可以压到 0%,重心移到「评价/创造」?"]}]},5:{transferAxis:"换先备知识",chain:[{step:1,kind:"observation",stem:"看「方法论严谨链 6 层 + 关键误区清单」,学生卡点频率最高的是哪一类误区?",options:[{key:"lvl2-policy",label:"政策威胁被塞进 W 维(38%)",mistakeType:"misread"},{key:"lvl3-adj",label:"条目用形容词无数据(62%)",mistakeType:"misread"},{key:"lvl5-notows",label:"做完 SWOT 不做 TOWS(62%)",mistakeType:"misread"},{key:"lvl6-nocrit",label:"完全不批判 SWOT 工具局限(78%)",correct:!0}],hints:[{level:1,kind:"direction",text:"看 5 类误区右侧的 frequency 数字,哪个最高?"},{level:2,kind:"contrast",text:"78% 远高于 62%——「批判」比「TOWS」更普遍,意味着什么?"},{level:3,kind:"principle",text:"卡点最普遍的层级就是教学盲区——绝大多数学生在那里被忽略过。"},{level:4,kind:"answer",text:"答案是 D。78% 学生不批判 SWOT 工具局限——这是 SWOT 教学最普遍的盲区。"}]},{step:2,kind:"diagnosis",stem:"78% 学生不批判 SWOT 工具局限,根本原因是什么?",options:[{key:"not-taught",label:"学生没学过批判思维,这节课先教批判技巧再说",mistakeType:"knowledge-gap-misread",theorySource:"Berliner novice · 把教学盲区误判为能力缺失"},{key:"hidden-core",label:"工具批判是 SWOT 教学的隐性内核,学生没被引导过去思考",correct:!0},{key:"no-time",label:"学生时间不够,做完 SWOT 已经没空批判了",mistakeType:"single-cue",theorySource:"Shulman PCK · 把教学设计问题误归到学生时间"},{key:"too-high",label:"工具批判是研究生水平,本科生不必要",mistakeType:"overgeneralization",theorySource:"Hammerness · 用学生层次为教学盲区开脱"}],hints:[{level:1,kind:"direction",text:"看 6 层难度阶梯——lvl-1 事实卡点仅 5%。基础能力是有的吗?"},{level:2,kind:"contrast",text:"如果是「学生没学过批判」,为什么 lvl-1 / lvl-2 都做得不错?基础认知是没问题的。"},{level:3,kind:"principle",text:"工具批判是 SWOT 教学的「压舱石」——区分本科和中专培训的关键就在这一层是否做。"},{level:4,kind:"answer",text:"答案是 B。工具批判是 SWOT 教学的隐性内核,但 78% 学生从未被显式引导去思考工具的边界。这是教学盲区,不是学生能力问题。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清最普遍的卡点(Q1),也理解了它背后是教学盲区而不是学生能力(Q2)。现在你来拍板——",postSelectReflection:{prompt:"学生把 SWOT 四象限填得很满,但被问「SWOT 工具有什么局限」时哑口——你愿意把这种产出当成「达标」吗?用一句话说明。",field:"criticalAwarenessReflection",placeholder:"例:不愿意,工具批判是 SWOT 教学的灵魂…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换先备知识",stem:"假设下学期教给已经学过 PESTLE / 五力模型的班级(已具备战略工具批判经验),本节的 lvl-6「批判」卡点会变吗?6 层问题链的顺序还合理吗?",scaffold:["先备工具批判能力:有基础 vs 无基础,引导路径要变吗?","第 6 层「批判」位置:仍放最后,还是提前到第 3 层做工具对照?","学生能力:能否直接对比 SWOT 与 PESTLE 的局限,而非从零学批判?"]}]},6:{transferAxis:"换医疗体系/地域",chain:[{step:1,kind:"observation",stem:"看「华海药业案例证据密度图」6 个维度,最缺证据的两个维度是哪一对?",options:[{key:"s-o",label:"S 维 (80%) + O 维 (76%)",mistakeType:"misread"},{key:"w-t",label:"W 维 (42%) + T 维 (70%)",mistakeType:"misread"},{key:"role-risk",label:"角色立场 (38%) + 风险边界 (34%)",correct:!0},{key:"enough",label:"全都够 70%+,案例没问题",mistakeType:"misread"}],hints:[{level:1,kind:"direction",text:"条形图越短代表证据越缺,最短的两条是哪两个?"},{level:2,kind:"contrast",text:"S 维 80% vs 风险边界 34%,差了 46 个点——这是什么类型差异?"},{level:3,kind:"principle",text:"经典 SWOT 4 维(S/W/O/T)是已有的;真正缺的是利益相关者立场和监管边界——这是药事现场的复杂性所在。"},{level:4,kind:"answer",text:"答案是 C。角色立场 38% + 风险边界 34% 是最低两项,反映本案例只有「企业视角」证据。"}]},{step:2,kind:"diagnosis",stem:"角色立场 + 风险边界证据最缺,意味着案例最严重的问题是什么?",options:[{key:"missing-stake",label:"案例需要补「患者/医保局立场材料」和「企业违规边界材料」,学生才能做多元判断",correct:!0},{key:"case-old",label:"案例太老了(2018 缬沙坦事件),换新企业就好",mistakeType:"single-cue",theorySource:"Shulman PCK · 误判为「时间问题」而非「视角缺失」"},{key:"students-fix",label:"学生不会自己脑补立场,这节课先教共情技巧",mistakeType:"knowledge-gap-misread",theorySource:"Berliner novice · 把材料缺失误判为学生能力缺失"},{key:"stick-swot",label:"缺这两类就缺吧,SWOT 主要看 S/W/O/T 四象限",mistakeType:"overcoverage-shrink",theorySource:"Hammerness · 用工具框架为案例缺陷开脱"}],hints:[{level:1,kind:"direction",text:"「角色立场」「风险边界」对学生做 SWOT 判断起什么作用?能否凭空脑补?"},{level:2,kind:"contrast",text:"如果学生只有「企业视角」材料,SWOT 4 象限会变成什么?——会全是企业自评。"},{level:3,kind:"principle",text:"药事决策本质是多方利益博弈;只有企业视角的案例只能训练「自评」,无法训练「多元判断」。"},{level:4,kind:"answer",text:"答案是 A。学生没有患者/医保局立场材料就只能做「企业视角」SWOT,失去多元利益相关者的判断训练。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清证据缺口(Q1),也理解了缺这两类材料学生只能做单一视角判断(Q2)。现在你来拍板——",postSelectReflection:{prompt:"学生交上来的 SWOT 全是企业视角(管理者立场),没有患者/医保局/竞争者的角度——你愿意把这种作业当成「达标」吗?用一句话说明。",field:"stakeholderViewReflection",placeholder:"例:不愿意,药事决策本质是多方利益博弈…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换医疗体系/地域",stem:"假设案例换成「县域药店供应链」(不是华海这种大药企),证据密度图的优先级会怎么变?哪些维度的「补证据」优先级会调换?",scaffold:["现场可获得证据:县域药店有公开年报吗?替代证据从哪里来?","角色立场:县域药店的患者/医保局视角和省级三甲药事的视角有何不同?","风险边界:不同医疗体系下,合规风险的具体类型会变吗?"]}]},7:{transferAxis:"换班级规模",chain:[{step:1,kind:"observation",stem:"看「45 分钟课堂时间分配」4 段比例,占比最高的是哪一段?",options:[{key:"lecture",label:"讲授 27%",mistakeType:"misread"},{key:"analyze",label:"分析 31%",correct:!0},{key:"collab",label:"协作 29%",mistakeType:"misread"},{key:"feedback",label:"反馈 13%",mistakeType:"misread"}],hints:[{level:1,kind:"direction",text:"看 4 个百分比哪个最大?"},{level:2,kind:"contrast",text:"讲授 27% 与协作 29% 接近,但分析 31% 是 4 段中最高。"},{level:3,kind:"principle",text:"占比最高的段就是教师投入认知设计最多的环节——本节课重心在哪里。"},{level:4,kind:"answer",text:"答案是 B。分析 31% 占比最高,反映本节课的重心是案例精读 + 法条分析。"}]},{step:2,kind:"diagnosis",stem:"分析占 31%(案例精读 + 法条分析)是占比最高的段,这意味着什么?",options:[{key:"cut-more",label:"教师讲授太多了,要继续压缩",mistakeType:"label-misread",theorySource:"Berliner novice · 没看清「分析」≠「讲授」"},{key:"high-order-core",label:"案例分析是 SWOT 课的高阶训练核心,31% 是合理预算",correct:!0},{key:"force-collab",label:"应该把分析也压到 25%,让协作占 35%+ 才算「以学生为中心」",mistakeType:"overgeneralization",theorySource:"Hammerness · 学生中心 ≠ 协作占比"},{key:"equal-split",label:"45 分钟课所有段都该 25% 均分才公平",mistakeType:"mechanical-equalize",theorySource:"新教师形式归因 · 比例均分 ≠ 教学合理"}],hints:[{level:1,kind:"direction",text:"看 4 段标签,「分析」和「讲授」是同一回事吗?谁是教师主导,谁是学生主导?"},{level:2,kind:"contrast",text:"如果分析压到 25%,协作扩到 35%,反馈仍 12%——学生分析没做透就跳协作,会怎样?"},{level:3,kind:"principle",text:"4 段比例的本质是「学生认知参与曲线」:讲授(Passive)→分析(Active)→协作(Constructive)→反馈(Interactive)。不是「谁高谁好」。"},{level:4,kind:"answer",text:"答案是 B。案例分析(32%)是 SWOT 课的高阶训练核心——学生需要时间精读法条、对比数据、形成判断。32% 是合理预算。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清各段占比(Q1),也理解了分析 31% 是高阶训练的合理预算(Q2)。现在你来拍板——",postSelectReflection:{prompt:"你这堂 45 分钟课,如果学生在 12-25 分钟微实战段做不完 SWOT+TOWS(只做了 SWOT),你愿意把这堂课当成「按计划完成」吗?用一句话说明。",field:"towsCompletionReflection",placeholder:"例:不愿意,TOWS 是 SWOT 的终点,缺它整节课失重…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换班级规模",stem:"假设班级从 40 人减到 15 人,4 段比例(讲授/分析/协作/反馈)该怎么调?协作段的 30 分钟实战还合适吗?",scaffold:["协作单位:15 人能否拆 3-4 组(每组 3-5 人),还是 1 大组 + 2 小组?","巡视密度:15 人比 40 人教师更容易追问到每个学生,反馈段是否可以缩到 8%?","实战时长:小班需要更长(因为追问更深入)还是更短(因为讨论更聚焦)实战时间?"]}]},8:{transferAxis:"换协作单元",chain:[{step:1,kind:"observation",stem:"看「4 角色任务密度条形图」,任务密度最低、最易塌缩的是哪个角色?",options:[{key:"info",label:"资料员 (72)",mistakeType:"misread"},{key:"judge",label:"判断员 (66)",mistakeType:"misread"},{key:"question",label:"质询员 (48)",correct:!0},{key:"report",label:"汇报员 (58)",mistakeType:"misread"}],hints:[{level:1,kind:"direction",text:"看 4 个角色的密度数字,哪个最小?"},{level:2,kind:"contrast",text:"资料员 72 vs 质询员 48,差了 24 个点——这种差距说明什么?"},{level:3,kind:"principle",text:"密度最低的角色是协作中「最易塌缩」的——任务设计不够具体,学生不知道做什么。"},{level:4,kind:"answer",text:"答案是 C。质询员 48 分最低,被标 warn——任务最易塌缩,需要补脚本。"}]},{step:2,kind:"diagnosis",stem:"质询员任务最易塌缩(48 分),根本原因是什么?",options:[{key:"personality",label:"学生性格内向不敢质询,换性格外向的同学分这个角色",mistakeType:"trait-attribution",theorySource:"新教师性格归因 · 把任务设计缺陷误归到学生性格"},{key:"no-script",label:"质询「追问证据强度」是抽象动作,缺具体追问脚本学生不知道怎么质询",correct:!0},{key:"drop-role",label:"质询员可以省掉,4 角色改成 3 角色",mistakeType:"overcoverage-shrink",theorySource:"Hammerness · 用减角色为设计缺陷开脱"},{key:"students-shy",label:"学生不会就是不会,等他们成熟了就好",mistakeType:"moral-attribution",theorySource:"新教师道德归因 · 把可教问题归到不可教属性"}],hints:[{level:1,kind:"direction",text:"看资料员的任务描述「财报+集采数据提取」——具体动作明确;质询员「证据强度追问」——动作明确吗?"},{level:2,kind:"contrast",text:"如果是「学生性格」,为什么资料员/判断员/汇报员都不塌缩?这 3 类性格特征也不一样。"},{level:3,kind:"principle",text:"协作塌缩 ≠ 学生不愿意 = 任务设计不够具体。教师需要给抽象动作配脚本(如「请指出对方证据中最弱的一条」)。"},{level:4,kind:"answer",text:"答案是 B。质询是抽象动作,缺具体脚本学生无所适从。补 5-10 句追问模板就能让密度回到 65+。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清质询员是任务塌缩点(Q1),也理解了塌缩源于任务设计抽象而非学生性格(Q2)。现在你来拍板——",postSelectReflection:{prompt:"你设计的协作任务,如果质询员小组每次都靠组长包办——你愿意把这种「协作」当成「真协作」吗?用一句话说明。",field:"trueCollaborationReflection",placeholder:"例:不愿意,4 个学生都该有自己的证据产出…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换协作单元",stem:"假设把 4 角色协作改为 2 人小组协作(只剩判断员 + 质询员),你设计的议程—角色映射还成立吗?哪些角色被并掉了?承担它们任务的人会怎么样?",scaffold:["角色合并:资料员功能并入哪个角色?汇报员呢?","议程映射:原本 5 议程映射到 4 角色,2 人组要怎么映射?会不会过载?","证据产出:每人产出量翻倍,会不会反而降低质量?"]}]},9:{transferAxis:"换触发类型",chain:[{step:1,kind:"observation",stem:"看「3 个学情校准点(Z1/Z2/Z3)规则状态」,目前几个锚点已经写了「如果 X 则 Y」规则?",options:[{key:"zero",label:"0 个(全部 miss 状态)",correct:!0},{key:"one",label:"1 个",mistakeType:"misread"},{key:"two",label:"2 个",mistakeType:"misread"},{key:"three",label:"3 个(全部已配规则)",mistakeType:"misread"}],hints:[{level:1,kind:"direction",text:"看 3 行状态,有几个是「miss」(尚未编辑规则)?"},{level:2,kind:"contrast",text:"如果有锚点已配规则,会标 ok 状态——但 3 行全是 miss。"},{level:3,kind:"principle",text:"状态 miss 表示「锚点位置已定但规则未配」——这正是 S6 节点要做的事。"},{level:4,kind:"answer",text:"答案是 A。Z1/Z2/Z3 三个锚点目前都是 miss 状态——尚未编辑「如果 X 则 Y」规则。"}]},{step:2,kind:"diagnosis",stem:"3 个锚点全部未编辑规则,意味着什么?",options:[{key:"improvise",label:"规则可以课中临场判断,不必事先写",mistakeType:"no-prep-fallacy",theorySource:"新教师即兴主义 · 高估课堂临场认知容量"},{key:"anchor-without-rule",label:"锚点没有规则等于没有锚点——本节点不允许通过",correct:!0},{key:"self-resolving",label:"课中调控不重要,反正学生做完会暴露问题",mistakeType:"process-blindness",theorySource:"新教师过程盲点 · 假设学生会自我暴露 ZPD"},{key:"experience",label:"这是新教师才需要,有经验老师靠直觉就行",mistakeType:"experience-myth",theorySource:"Hammerness · 经验主义对外置认知工具的误解"}],hints:[{level:1,kind:"direction",text:"课堂中你做完微评估,要在 1 分钟内决定「继续/暂停/重启」——这 1 分钟的认知容量够做新决策吗?"},{level:2,kind:"contrast",text:"如果可以「课堂临场」,为什么 contract 要规定硬约束「每个锚点必须有规则」?"},{level:3,kind:"principle",text:"课堂 1 分钟决策远低于「凭感觉判断」需要的认知容量。规则是「教师外置认知」,不是约束,是节省思考。"},{level:4,kind:"answer",text:"答案是 B。锚点没有规则等于没有锚点。L1 形成性评价硬约束:每锚点必须配「如果 X 则 Y」,否则课堂学情捕捉会退化为「凭感觉」。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清 3 锚点规则全空(Q1),也理解了规则是教师外置认知不是约束(Q2)。现在你来拍板——",postSelectReflection:{prompt:"课堂上你的 ZPD 锚点收到学情数据,你愿意「凭感觉」决定继续/暂停/重启吗?还是希望事先写好规则?用一句话说明。",field:"ruleVsIntuitionReflection",placeholder:"例:希望事先写好,1 分钟决策容量太小不能凭感觉…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换触发类型",stem:"假设你设计的「如果 X 则 Y」规则,X 从「认知正确率」换成「学生情绪冷场」(非认知信号),Y 还成立吗?你怎么改写规则?",scaffold:["触发条件 X:认知误区可以量化(正确率),情绪/参与度怎么量化?","反馈动作 Y:认知卡点对应「再讲一遍」,情绪冷场对应什么动作?","阈值:认知触发用百分比,情绪触发用什么阈值?(沉默时长?举手率?)"]}]},10:{transferAxis:"换学生分布",chain:[{step:1,kind:"observation",stem:"看「5 维量规雷达 + Pareto 低分」,5 维中平均分最低的是哪一维?",options:[{key:"classify",label:"内外分类准确性 (78)",mistakeType:"misread"},{key:"concise",label:"条目精炼度 (62)",mistakeType:"misread"},{key:"evidence",label:"条目证据性 (46)",mistakeType:"misread"},{key:"critical",label:"批判意识 (38)",correct:!0}],hints:[{level:1,kind:"direction",text:"看 5 个分数哪个最小?"},{level:2,kind:"contrast",text:"「批判意识」38 分 vs 「内外分类」78 分——差了 40 个点。"},{level:3,kind:"principle",text:"最低分维度就是 SWOT 课最大的失分区。"},{level:4,kind:"answer",text:"答案是 D。批判意识 38 分最低——无组主动指出 SWOT 工具局限。"}]},{step:2,kind:"diagnosis",stem:"批判意识 38 分最低,但下一轮评价该重点抓什么?",options:[{key:"pick-lowest",label:"抓批判意识(38)——既然最低分,就该重点改进",mistakeType:"naive-pareto",theorySource:"Pareto 误用 · 单看分数不看可教性 + 投入"},{key:"drop-difficulty",label:"学生不会批判,下次降低难度让分数提上来",mistakeType:"overgeneralization",theorySource:"Hammerness · 用降难度为评价退化开脱"},{key:"evidence-first",label:"抓条目证据性(46)——虽不是最低,但最可教、1 节课内能提到 70+",correct:!0},{key:"format-only",label:"看格式是否完整就行,不必逐维评分",mistakeType:"format-only",theorySource:"新教师评价退化 · 评价从「质量」退化到「格式」"}],hints:[{level:1,kind:"direction",text:"看 5 维右侧的 source 描述——「批判意识」需要多久能提升?「条目证据性」呢?"},{level:2,kind:"contrast",text:"最低分一定是优先项吗?如果「批判意识」要 4-5 节课、「证据性」要 1 节课——你选哪个?"},{level:3,kind:"principle",text:"Pareto 优先级 = 影响 ÷ 投入,不只看分数。低分但难教的维度先放,低分且可教的优先抓。"},{level:4,kind:"answer",text:"答案是 C。条目证据性 46 分,Pareto 第 3,但基础维度——加「每条 SWOT 配 1 条出处」训练,1 节课内能提 30 分。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清最低分维度(Q1),也理解了 Pareto 优先级不是简单按分数排(Q2)。现在你来拍板——",postSelectReflection:{prompt:"学生作品 5 维全部「形式上完成」(都打了 60 分以上),但低分维度集中在「批判意识」和「证据性」——你愿意把这种作业当成「达标」吗?用一句话说明。",field:"rubricSubstanceReflection",placeholder:"例:不愿意,基础维度不过关,高阶维度无意义…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换学生分布",stem:"假设这次评的不是混合班,而是高分组(基础已掌握)——5 维 Pareto 排序会变吗?反馈语模板需要重写吗?",scaffold:["高分组的基础维度:条目证据性可能不是低分,直接跳过吗?","高阶维度:对高分组,TOWS 可操作性 + 批判意识反而是低分?","反馈语:针对高分组,「指明下一步」会变成什么(更深批判 + 更复杂场景)?"]}]},11:{transferAxis:"换下轮约束",chain:[{step:1,kind:"observation",stem:"看「资产沉淀价值图」4 类资产,哪一类被标为「不可复用 / miss 状态」?",options:[{key:"sample",label:"低分样例 (76 · ok)",mistakeType:"misread"},{key:"feedback",label:"反馈语 (68 · ok)",mistakeType:"misread"},{key:"case-revise",label:"修订案例 (82 · ok)",mistakeType:"misread"},{key:"mood",label:"课堂气氛 (28 · miss)",correct:!0}],hints:[{level:1,kind:"direction",text:"看 4 类资产右侧的 status 标记,哪个是「miss」?"},{level:2,kind:"contrast",text:"「修订案例」82 vs 「课堂气氛」28——差了 54 个点。它们的本质区别是什么?"},{level:3,kind:"principle",text:"可复用性 = 下一轮课能否直接调用。「样例/反馈语/案例」可复用,「气氛」是过程结果,不可复用。"},{level:4,kind:"answer",text:"答案是 D。课堂气氛 28 分被标 miss——它是结果不是工具,不能被下一轮课直接调用。"}]},{step:2,kind:"diagnosis",stem:"课堂气氛 28 分「不可复用」,这意味着复盘时该重点保存什么?",options:[{key:"subjective",label:"气氛活跃就够了,可以记下来作为「这次教得不错」的依据",mistakeType:"process-blindness",theorySource:"新教师过程盲点 · 把结果误判为可复用资产"},{key:"reusable",label:"保留可被下一轮直接调用的具体资产(样例/反馈语/案例)",correct:!0},{key:"keep-all",label:"全部保留,资产越多越好",mistakeType:"overcoverage",theorySource:"Hammerness · 贪多倾向"},{key:"drop-samples",label:"学生 SWOT 错例不重要,下次学生不同就用不上",mistakeType:"overgeneralization",theorySource:"新教师 · 错例的迁移性被低估"}],hints:[{level:1,kind:"direction",text:"看 ok 状态的 3 类资产——它们有什么共同点?都能被下一轮课直接拿来用吗?"},{level:2,kind:"contrast",text:"「样例」可以拿来给下届学生看,「气氛」呢?你能给下届「气氛」吗?"},{level:3,kind:"principle",text:"教学资产 = 可被下一轮重复调用的具体材料/规则/反馈/案例。「气氛」是结果不是工具。"},{level:4,kind:"answer",text:"答案是 B。资产的判断标准是「可复用性」。气氛 miss 状态浪费精力保存——保留可被下一轮调用的样例/反馈/案例。"}]},{step:3,kind:"decision",reuseExistingDecisionBank:!0,transitionLine:"你已经看清哪类资产不可复用(Q1),也理解了资产的核心标准是可复用性(Q2)。现在你来拍板——",postSelectReflection:{prompt:"你这次教完只记下「学生反应好/不好」(气氛印象),没保留任何具体错例、反馈语、案例修订——你愿意把这种复盘当成「完成」吗?用一句话说明。",field:"assetReusabilityReflection",placeholder:"例:不愿意,这种复盘下次还是要从头来…"}},{step:4,kind:"transfer",openEnded:!0,blocksProgress:!1,transferAxis:"换下轮约束",stem:"假设下学期教学时长砍 30%(90 → 60 分钟),你这次写的「下一轮第 1 改进项」还排第一吗?哪条会被挤掉?",scaffold:["时长压缩:90→60,讲授/分析/协作/反馈的比例怎么调?","改进项优先级:你列的 3 条改进,哪条最依赖时间预算?","牺牲项:哪条改进必须放弃?为什么?"]}]}};h.PharmacoPilotQuestionChain=Object.freeze(N)}(window),function(h){"use strict";const N={id:1,version:"phase11-v3",parentStageId:"S1",subNodeKey:"1",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[],isOrigin:!0,originNote:"学习产出链起点 · 本节点为整条链路的源头",outputsTo:[{stationId:4,label:"学习目标",outKey:"定位类型 → 学习目标改写"},{stationId:7,label:"教学过程",outKey:"定位类型 → 时间分配策略"}]},narrative:{what:"明确本节课在课程体系、专业能力培养和学生任务产出中的位置，写清它与前一节、下一节的承接关系。",why:"防止从「讲知识点」直接开始备课——先把这节课在整门课中的位置说清楚，避免讲完了与前后失联。",how:"查看「药事 · 目标—药事 · 任务—药事 · 产出」定位图与「前一节—本节—下一节」上下文卡，选择定位类型，生成课程定位段落 + 课程位置说明。"},evidenceFigure:{title:"药事 · 目标—药事 · 任务—药事 · 产出 三角图 + 前后节承接上下文卡",subtitle:"看本节课在课程序列中处在哪个位置",evidenceNote:"定位决定 SWOT 是「方法训练」还是「决策训练」——同一案例可以走出完全不同的课。",triangle:[{vertex:"药事 · 目标",label:"培养循证决策能力",weight:.4},{vertex:"药事 · 任务",label:"企业战略 SWOT 分析",weight:.32},{vertex:"药事 · 产出",label:"带证据带 TOWS 的 SWOT 报告",weight:.28}],dynamicScoring:{enabled:!0,sourceStation:2,sourceField:"cohortExperience",adjustsDim:"学情起点适配",rule:"if station2 saved AND cohortExperience exists: 学情起点适配 = baseScore + (家人慢病比例 - 0.5) * 10; 否则用 bars 默认值",notice:"未保存 station2 前测时，下列分值为通用样例；上传当班前测后将自动重算。"},bars:[["综合决策型",82,{status:"ok",source:"贯通病—证—管 4 类决策",breakdown:[{dim:"课程主线对齐",score:18,max:20,note:"直接对应「循证决策能力」主线"},{dim:"高阶能力培养",score:20,max:20,note:"强制学生做判断,而非记 SWOT 定义"},{dim:"避免工具化退化",score:16,max:20,note:"仍可能落入「教 SWOT 工具」陷阱"},{dim:"学情起点适配",score:14,max:20,note:"Q4 仅 19% 正确,部分学生跟不上高阶"},{dim:"前后节承接",score:14,max:20,note:"推到 PESTLE/Porter 自然"}]}],["证据研究型",64,{status:"ok",source:"强调循证查询",breakdown:[{dim:"课程主线对齐",score:14,max:20,note:"偏向「证据检索」,弱判断属性"},{dim:"高阶能力培养",score:14,max:20,note:"检索/综述 < 判断"},{dim:"避免工具化退化",score:12,max:20,note:"容易变成「教查文献」"},{dim:"学情起点适配",score:14,max:20,note:"课前可以补先备知识"},{dim:"前后节承接",score:10,max:20,note:"偏离判断主线"}]}],["服务运营型",48,{status:"warn",source:"贴近基层但偏离 SWOT 本质",breakdown:[{dim:"课程主线对齐",score:8,max:20,note:"偏离循证决策主线"},{dim:"高阶能力培养",score:10,max:20,note:"服务训练偏应用"},{dim:"避免工具化退化",score:8,max:20,note:"SWOT 用于门店,分析对象错位"},{dim:"学情起点适配",score:12,max:20,note:"学生药店实习经验有限"},{dim:"前后节承接",score:10,max:20,note:"与战略管理章弱关联"}]}],["政策治理型",56,{status:"ok",source:"适合医保/监管班型",breakdown:[{dim:"课程主线对齐",score:10,max:20,note:"偏向「政策分析」"},{dim:"高阶能力培养",score:14,max:20,note:"政策判断含高阶元素"},{dim:"避免工具化退化",score:10,max:20,note:"容易变成政策辩论"},{dim:"学情起点适配",score:12,max:20,note:"学生对政策细节不熟"},{dim:"前后节承接",score:10,max:20,note:"政策 ↔ 战略弱关联"}]}]],spiral:{previous:{label:"管理学原理 · 战略管理章",note:"SWOT 概念首次出现 · 偏定义"},current:{label:"药事管理 · SWOT 应用",note:"本节 · 把 SWOT 应用到药企 · 加 TOWS"},next:{label:"药事管理 · PESTLE/Porter",note:"下节 · 引入更结构化战略工具 · 暴露 SWOT 局限"}},flow:["看三角","选定位","钉位置"]},decision:{question:"本节 SWOT 课最应该被定位为什么？",options:[{key:"comprehensive",label:"综合决策型定位 · 贯通病—证—管 4 类决策",rationale:"能让本节服务于课程主线（药事管理证据决策能力）。SWOT 仅是工具，主目标是循证决策训练。",score:3.8,meta:{recommended:!0}},{key:"research",label:"证据研究型定位 · 强调循证查询与综述",rationale:"强化文献检索与综述训练，但偏离了 SWOT 的判断属性。",score:3.4},{key:"service",label:"服务运营型定位 · 贴近基层药学服务实务",rationale:"贴近实务，但 SWOT 分析对象通常是企业不是门店，定位偏移。",score:2.8},{key:"policy",label:"政策治理型定位 · 适合医保/监管/合规导向",rationale:"适合医保/监管班型，与「集采常态化」情境契合，但会让 W/T 维分析过度政治化。",score:3.2}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{comprehensive:{summary:"✓ 与课程主线对齐",riskBadges:["定位起点","高一致性"],detail:"本定位下，目标与量规环节 目标会被改写为「能用 SWOT 完成药事管理决策」，任务链环节 时间线 30 分钟实战段是合理预算。"},research:{summary:"△ 偏离判断属性",riskBadges:["定位偏移"],detail:"证据型定位会让 30 分钟实战变成「查资料」，丧失高阶判断训练机会。"},service:{summary:"△ 分析对象不匹配",riskBadges:["对象错位"],detail:"门店级 SWOT 与药企 SWOT 在权重维度上差异显著，建议换案例对象再选此项。"},policy:{summary:"△ 张力维度被放大",riskBadges:["政治化风险"],detail:"若学生议程已经偏向政策（学习者议程 显示集采伦理为最高票），叠加此定位会让 SWOT 退化为政策辩论。"}},artifacts:[{id:"positioning-statement",buttonLabel:"⬇ 生成课程任务定位段落 + 课程位置说明",outputTitle:"课程任务定位 v1",outputCue:"把本节课的定位类型 + 前后节承接上下文写成可挂在教案首页的一段话。",artifactLines:{evidence:"本节定位为综合决策型 · 药事 · 目标权重 0.40 · 药事 · 任务权重 0.32 · 药事 · 产出权重 0.28。",action:"把定位段落写入教案首页；并把「前一节—本节—下一节」前后节承接链记入备课文档。",constraints:["定位类型必须落到 4 类之一","必须显式回答「本节 SWOT 是工具还是目的」","必须显式标注前一节与下一节"]},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"永不锁 · 本节点是起点"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断 · 数据流入学习目标 + 任务链"},E:{id:"artifactDone",desc:"已生成定位段落 · 教学环节 S1 完成"}},lintRules:[{id:"stage-1-pending",when:"Store.getJudgment(1) === null",severity:"info",onTriggerUI:"首屏提示「建议从 S1 开始」"}],horizontalLayerHooks:{L1:{visible:!1,reason:"L1 在 7/8/9"},L2:{visible:!1,reason:"议程源头在学习者议程"},L3:{visible:!0,sticky:!0,minimizedHeight:32,role:"origin"}},persistence:{userJudgments:{path:"userJudgments[1]"},artifactLibrary:{path:"artifactLibrary"},qualityCheckpoints:{backendMappingTo20Steps:["教学情境","课程任务","专业能力","产出边界","课程位置"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[1]=v(N)}(window),function(h){"use strict";const N={id:2,version:"stages-v4",parentStageId:"S1",subNodeKey:"2",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:1,label:"课程定位",key:"定位类型",snippet:"综合决策型 · SWOT 是工具不是目的"}],outputsTo:[{stationId:3,label:"议程协商",outKey:"学情低分项 → 议程关切"},{stationId:4,label:"学习目标",outKey:"学情前测 → 目标补强"}]},narrative:{what:"显性区分两类入口：认知前测（先备知识、误区、参与度）+ 经验入口（学生与药事现场的真实接触经历）。",why:"新教师常常只看学生「知道什么」，忽略他们「见过什么」。学生进入药事管理课时的家人慢病 / 社区药店实习 / 院内见习经历是学习的真实起点。",how:"查看认知前测分布图 + 经验入口图，识别认知和经验两类断层，生成学情分析、导学任务、诊断题、经验入口任务。"},evidenceFigure:{title:"认知前测 4 题 + 经验入口分布",subtitle:"看本班最可能卡在哪里",evidenceNote:"学情入口决定 SWOT 课能否在 30 分钟实战段真正起飞。",preTest:[{q:"Q1 · SWOT 中 W 指什么",correctPct:65,status:"ok",commonMisconception:null},{q:"Q2 · S 与 W 的判定边界",correctPct:32,status:"warn",commonMisconception:"误把外部威胁当成内部劣势"},{q:"Q3 · O / T 来自内 / 外部",correctPct:41,status:"warn",commonMisconception:"认为政策一定是 O 而非 T"},{q:"Q4 · 同时为 S 与 T 的情景",correctPct:19,status:"miss",commonMisconception:"认为 S 与 T 互斥（38% 学生）"}],cohortExperience:[{type:"家人慢病服药",pct:60,evidenceSrc:"高血压 / 糖尿病 / 慢病"},{type:"社区药店打工 / 实习",pct:23,evidenceSrc:"校内或寒暑假经历"},{type:"院内药剂科见习",pct:18,evidenceSrc:"课程见习 / 医院实践"},{type:"无任何药事接触",pct:12,evidenceSrc:"需补充情境锚"}],participationQuadrants:[{label:"主动 + 高知",pct:22,color:"#3a8a4e"},{label:"主动 + 低知",pct:28,color:"#b8860b"},{label:"被动 + 高知",pct:18,color:"#5a7090"},{label:"被动 + 低知",pct:32,color:"#a8492a"}],bars:[["Q1 · W 含义",65,{status:"ok"}],["Q2 · S/W 边界",32,{status:"warn"}],["Q3 · 内外来源",41,{status:"warn"}],["Q4 · S 与 T 并存",19,{status:"miss"}]],flow:["看分布","找断层","定支架"]},decision:{question:"本班进入案例探究前最需要处理的入口问题是什么？",options:[{key:"evidence",label:"学生会填表但证据链表达不足",rationale:"最容易被忽略的高风险问题。Q4 仅 19% 正确率反映「证据 vs 立场」混淆。建议前置证据引用训练。",score:3.7,meta:{recommended:!0,lintTriggers:["pre-test-low"]}},{key:"boundary",label:"内部条件与外部环境边界混淆",rationale:"Q3 仅 41% 正确率。需要通过正反例和判断流程卡澄清。建议提供「政策 = T 而非 O」反例。",score:3.3},{key:"experience",label:"缺药事接触经验的 12% 学生进不去情境",rationale:"经验入口缺口。建议为这部分学生准备「家人慢病情境锚」前置任务。",score:3.5,meta:{v3New:!0}},{key:"participation",label:"低参与学生无法进入任务",rationale:"32% 被动 + 低知象限学生需要低门槛入口和小组角色支持。",score:3}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{evidence:{summary:"✓ 命中最高风险维度",riskBadges:["前置训练","高优先级"],detail:"选择此项后，建议在知识与误区环节 问题链第 3 题前加入「为本条 SWOT 配 1 条证据出处」即时训练。"},boundary:{summary:"△ 第二优先级",riskBadges:["概念边界"],detail:"建议案例与证据环节 案例材料显式标注「政策 / 数据 / 角色 / 风险边界」5 类标签。"},experience:{summary:"✓ 经验入口缺口",riskBadges:["经验入口"],detail:"为 12% 无药事接触学生提供「家人慢病情境锚」前置任务（约 15 分钟阅读）。"},participation:{summary:"△ 协作设计层面",riskBadges:["延后到协作任务环节"],detail:"参与度问题属于协作设计范畴，建议在协作任务环节 协作任务里通过 4 角色分工解决。"}},artifacts:[{id:"learner-profile",buttonLabel:"⬇ 生成学情分析段落（认知 + 经验双入口）",outputTitle:"学情分析 v1 · 双入口诊断",outputCue:"把前测数据 + 经验分布合并为一段可挂教案首页的学情诊断。",artifactLines:{evidence:"Q4 正确率 19% · 38% 学生认为 S 与 T 互斥；12% 学生无任何药事接触经验。",action:"前置「证据出处训练」+ 为 12% 无经验学生准备「家人慢病情境锚」阅读。",constraints:["学情诊断须同时含认知前测与经验入口","高频误区须显式标注（Q4 38%）","经验入口须落到具体药事场景（家人慢病 / 药店 / 见习）"]},writeback:{to:"artifactLibrary"}},{id:"experience-onramp",buttonLabel:"⬇ 生成经验入口导学任务（针对 12% 无接触学生）",outputTitle:"经验入口导学任务 v1",outputCue:"为零经验学生提供 15 分钟情境锚阅读。",artifactLines:{evidence:"12% 学生无家人慢病 / 无社区药店 / 无见习经历，进入 SWOT 案例时缺情境感。",action:"选 2-3 段「老人慢病用药日常」「社区药店服务场景」短文（≤ 1500 字）作课前阅读。",constraints:["≤ 1500 字 / 15 分钟阅读","必须有具体场景（不能纯概念）","结尾要含 1 个引导问题（衔接学习者议程 议程协商）"]},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 课程定位 定位判断未保存"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断 · 数据流入学习者议程 / 4"},E:{id:"artifactDone",desc:"已生成学情双入口诊断"}},lintRules:[{id:"pre-test-low",when:"preTest.find(q => q.correctPct < 30) exists",severity:"high",onTriggerUI:"在选项 evidence 上加「高风险」徽章"}],horizontalLayerHooks:{L1:{visible:!1,reason:"L1 锚点在 S5/S6/S8"},L2:{visible:!1,reason:"议程源头在子节点 03（议程协商）"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[2]"},artifactLibrary:{path:"artifactLibrary"},qualityCheckpoints:{backendMappingTo20Steps:["学情分析","先备知识","常见误区","经验入口","预习任务","诊断题"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[2]=v(N)}(window),function(h){"use strict";const N={id:3,version:"phase11-v3",parentStageId:"S1",subNodeKey:"3",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:2,label:"学情分析",key:"学情入口要点",snippet:"本班 60% 学生有家人慢病 / 23% 有社区药店实习 / 一致性评价概念前测正确率 41%"}],outputsTo:[{stationId:4,label:"学习目标",outKey:"议程主张 → 目标改写"},{stationId:6,label:"情境化案例",outKey:"议程关切 → 案例证据"},{stationId:8,label:"探究协作",outKey:"议程意愿 → 角色分配"},{stationId:11,label:"教学反思",outKey:"议程兑现度回顾"}]},narrative:{what:"为学生在课前留一个可见的议程入口，让学生提出关切、质疑点、角色意愿，作为教师备课的真实输入。",why:"把学生当作可协商的合作者，而不只是被训练判断的对象——课前留一个可见的议程入口，让他们的关切先于教学预设进入备课。",how:"查看学生议程协商单（3 题）+ 学生响应聚类预览，识别议程与教师预设的张力，生成议程列表写入 Store。"},evidenceFigure:{title:"议程协商单 + 学生响应聚类预览",subtitle:"看学生最想搞清楚的是什么 · 与教师预设有何张力",evidenceNote:"议程不是意见调查，是可协商的学习起点。",surveyQuestions:[{id:"q1",text:"学这节 SWOT 课，你最想搞清楚的 1 件事是什么？"},{id:"q2",text:"看完华海药业的初步资料，你最不舒服 / 最想质疑的点是什么？"},{id:"q3",text:"如果要做小组任务，你最想扮演哪个角色（资料员 / 判断员 / 质询员 / 汇报员）？为什么？"}],mockStudentResponses:{sampleCount:28,clusters:[{agendaKey:"ethics-pricing",text:"集采降价合理性",studentVotes:11,sampleQuote:"我妈高血压药降到几毛钱一片，药企真的不亏吗？长期会不会出质量问题？",tensionWithTeacher:"教师预设是讲 SWOT 方法，学生想讨论政策伦理"},{agendaKey:"innovation-press",text:"创新药企挤压",studentVotes:7,sampleQuote:"百济神州一年研发 100 亿，华海能扛多久？",tensionWithTeacher:"教师预设 SWOT 是单家企业分析，学生想做行业对比"},{agendaKey:"valsartan-trust",text:"2018 事件信任修复",studentVotes:4,sampleQuote:"缬沙坦杂质事件后他们怎么自证？",tensionWithTeacher:"教师预设 W 维只用财务数据，学生想看声誉数据"},{agendaKey:"api-export",text:"原料药出海前景",studentVotes:3,sampleQuote:"FDA 不是禁过他们吗？现在还能卖到美国？",tensionWithTeacher:"教师预设 O 维只看国内政策"},{agendaKey:"cdmo-window",text:"CDMO 机遇判断",studentVotes:3,sampleQuote:"他们能转型做代工吗？药明康德那种？",tensionWithTeacher:"教师预设主线是仿制药，学生想看转型路径"}],roleIntent:[{role:"资料员",count:6,agendas:["innovation-press"]},{role:"判断员",count:11,agendas:["ethics-pricing","api-export"]},{role:"质询员",count:5,agendas:["valsartan-trust"]},{role:"汇报员",count:6,agendas:["cdmo-window"]}]},flow:["发协商单","看聚类","生成议程"]},decision:{question:"学生议程与教师预设的目标之间，最大的张力是什么？",options:[{key:"ethics",label:"学生关心政策伦理，教师定位是 SWOT 方法",rationale:"命中 11 票（39%）· 最高优先级议程。建议在案例与证据环节 案例材料中显式加入伦理证据。",score:3.8,meta:{recommended:!0,lintTriggers:["agenda-not-yet-saved"]}},{key:"policy",label:"学生想做行业对比，教师定位是单家企业",rationale:"建议在目标与量规环节 目标改写时纳入「与同行对比」维度。",score:3.5},{key:"align",label:"学生议程与教师预设基本一致",rationale:"保留议程作为课堂导入素材，提高 ownership。",score:3},{key:"narrow",label:"学生议程过于分散，强行收敛到教师预设",rationale:"过早收敛会削弱主体性，违反 contract「不得让议程站退化为调查表」。",score:1.5,meta:{lintTriggers:["agenda-suppressed"]}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{ethics:{summary:"✓ 高优先级张力识别",riskBadges:["议程源头","高优先级"],detail:"建议在案例与证据环节 案例材料显式加入伦理证据（如医保谈判降价幅度合理性数据），让议程在下游获得证据兑现。"},policy:{summary:"✓ 中等优先级张力",riskBadges:["议程源头"],detail:"建议在目标与量规环节 目标改写时纳入「与同行对比」维度。"},align:{summary:"△ 无明显张力",riskBadges:["建议警惕过滤"],detail:"议程与预设完全一致需警惕——可能是学生没真说，或采集方式诱导。"},narrow:{summary:"✕ 违反学生主体性约束",riskBadges:["禁条触发"],detail:"强行收敛违反 contract.FORBIDDEN_CHANGES 中「不得让学生议程站退化为调查表」。"}},artifacts:[{id:"agenda-list",buttonLabel:"⬇ 生成议程列表（5 条 · 写入 议程贯通源头）",outputTitle:"学生议程协商单 v1",outputCue:"把 28 位学生的响应聚类成 5 条可被下游引用的议程。",artifactLines:{evidence:"28 位学生响应聚类成 5 类议程，最高 11 票为「集采降价合理性」；4 个角色意愿分布均衡。",action:"把 5 条议程写入 Store · 4 个回响站（4/6/8/11）将自动加载议程标签。",constraints:["议程数 ≤ 5 条（避免分散）","每条议程必须有 ≥ 1 名学生具体回应","议程不得被教师重写（只能补充情境）"]},sideEffect:"seedAgendasFromStation3",writeback:{to:"artifactLibrary"}},{id:"agenda-action-map",buttonLabel:"⬇ 生成议程—课堂动作映射表",outputTitle:"议程→课堂动作映射 v1",outputCue:"为每条议程标注对应的下游动作（目标与量规环节/6/8 各做什么）。",writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 学情分析 学情判断未保存"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断"},E:{id:"artifactDone",desc:"已生成议程列表 · 议程源头就位"}},lintRules:[{id:"agenda-not-yet-saved",when:"Store.getAgendas().length === 0",severity:"high",onTriggerUI:"推荐选项 ethics 加「议程源头未就位」徽章"},{id:"agenda-suppressed",when:"decision.userChoice === 'narrow'",severity:"block",onTriggerUI:"blockSave + 红色禁条框"}],horizontalLayerHooks:{L1:{visible:!1,reason:"L1 在 7/8/9"},L2:{visible:!0,role:"source",writesTo:"Store.agendas",echoedAt:[4,6,8,11]},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[3]"},artifactLibrary:{path:"artifactLibrary"},agendas:{path:"agendas",readers:[4,6,8,11]},qualityCheckpoints:{backendMappingTo20Steps:["学生议程","议程张力","角色意愿","议程兑现承诺"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[3]=v(N)}(window),function(h){"use strict";const N={id:4,version:"phase11-v3",parentStageId:"S2",subNodeKey:"4",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:1,label:"课程定位",key:"定位类型 + 螺旋上下文",snippet:"综合决策型 · SWOT 是工具不是目的"},{stationId:2,label:"学情分析",key:"认知前测 + 经验入口",snippet:"一致性评价前测 41% · 23% 有社区药店实习"},{stationId:3,label:"议程协商",key:"5 条议程 · 最高票伦理",snippet:"ethics-pricing 11 票 / innovation-press 7 票 · 含 4 类张力"}],outputsTo:[{stationId:5,label:"问题链",outKey:"目标 → 问题链组织"},{stationId:9,label:"形成性评价",outKey:"目标 → 锚点测温内容"},{stationId:10,label:"表现性评价",outKey:"目标 → 5 维量规"}]},narrative:{what:"把教学目标改写为可观察、可评价、可由学生产出证明的学习成果；同时回应来自课程定位/2/3 的三类输入。",why:"顶卡显示来自前序三个环节的关键片段，强制目标改写时同时回应定位、学情低分项、学生议程主张。本节点与评价与画像环节 的目标—评价对齐必须显性化（含量规反向修订通道）。",how:"查看「目标—活动—产出—评价证据」矩阵 + Bloom 层级分布图 + 证据覆盖热图，识别目标缺口和证据缺口，生成学习目标与评价证据表。"},evidenceFigure:{title:"目标—活动—产出—评价 对齐矩阵",subtitle:"看每条目标是否有对应的评价证据",evidenceNote:"目标不能停在「理解」，必须能被学生产出证明。",bars:[["可观察行为",58,{status:"warn",source:"「理解 SWOT」类目标占 50%"}],["评价证据完整度",62,{status:"warn",source:"缺 TOWS 可操作性证据"}],["Bloom 层级覆盖",72,{status:"ok",source:"理解 → 应用 → 分析 → 评价 4 层"}],["对前序环节回应度",44,{status:"miss",source:"议程未在目标中显式映射"}]],bloomDistribution:[{level:"记忆",percent:8},{level:"理解",percent:22},{level:"应用",percent:28},{level:"分析",percent:22},{level:"评价",percent:14},{level:"创造",percent:6}],goalEvidenceMap:[{goal:"能区分 SWOT 四象限并识别条目所属象限",evidence:"5 道分类题正确率 ≥ 80%"},{goal:"能为每条 SWOT 配证据（量化 / 文件 / 政策）",evidence:"小组 SWOT 产出每条配出处 · 量规第 1 维"},{goal:"能从 SWOT 推导 ≥ 3 条 TOWS 战略",evidence:"30 分钟实战段产出 TOWS 表 · 量规第 4 维"},{goal:"能在质询环节为本组论据辩护",evidence:"交叉质询中每组至少应对 2 轮 · 录像评分"},{goal:"能指出 SWOT 工具的至少 2 个局限",evidence:"课末口述 · 量规第 5 维「批判意识」"}],flow:["看缺口","改目标","配证据"]},decision:{question:"当前目标设计最应补强哪一项？",options:[{key:"agenda-mapping",label:"把学习者议程 议程显式映射到学习目标",rationale:"命中 议程贯通的第 2 个回响点。议程对目标与量规环节 的回应度仅 44%，是 4 维中最差。",score:3.9,meta:{recommended:!0,lintTriggers:["L2-agenda-not-mapped"],v3New:!0}},{key:"evidence",label:"为每个目标配置评价证据",rationale:"Backward Design 主链。建议补完 TOWS 的可操作性证据。",score:3.7},{key:"verb",label:"把「理解」改写为可观察行为",rationale:"可观察行为打分仅 58%，「理解 SWOT」类目标占一半，需要重写为行为动词。",score:3.4},{key:"more",label:"增加更多目标以显得完整",rationale:"目标过多会稀释课堂主线，违反 contract「不得堆叠目标」。",score:1.7,meta:{lintTriggers:["forbidden-goal-bloat"]}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{"agenda-mapping":{summary:"✓ 议程贯通的第 2 回响点",riskBadges:["议程回响","高优先级"],detail:"选择此项后，5 条议程会在目标表中显式标注（如 ethics-pricing → 「能评价集采降价的合理性边界」）。"},evidence:{summary:"✓ Backward Design 主链",riskBadges:["目标—证据对齐"],detail:"本选项是 Backward Design 的标准动作，但当前更紧迫的是议程映射。"},verb:{summary:"△ 方向正确但次要",riskBadges:["建议第二步做"],detail:"动词化是基础修整，建议先补议程映射，本节末顺手把动词替换掉。"},more:{summary:"✕ 目标稀释",riskBadges:["禁条触发"],detail:"目标过多会让课堂主线模糊，违反 contract 中目标聚焦原则。"}},artifacts:[{id:"goal-evidence-table",buttonLabel:"⬇ 生成学习目标—评价证据对齐表",outputTitle:"学习目标与评价证据 v1",outputCue:"把 5 条目标与 5 条评价证据一一对应，确保 Backward Design 闭环。",artifactLines:{evidence:"当前 5 条候选目标 · 评价证据完整度 62% · 议程回应度 44%。",action:"把 5 条目标改写为行为动词形式，并为每条配置评价证据 + 议程映射。",constraints:["目标必须用「能 + 动词 + 对象」形式","每条目标必须有可观察的评价证据","至少 3 条目标显式回应学习者议程 议程","Bloom 层级覆盖 ≥ 4 层"]},writeback:{to:"artifactLibrary"}},{id:"agenda-goal-map",buttonLabel:"⬇ 生成议程—目标映射表（议程贯通 第 2 回响）",outputTitle:"议程—目标映射 v1",outputCue:"把学习者议程 的 5 条议程映射到本节的 5 条目标。",sideEffect:"mapAgendasToGoals",writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 课程定位 判断未保存"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断 · 数据流入知识与误区环节/9/10"},E:{id:"artifactDone",desc:"已生成目标—评价对齐表 · 教学环节 S2 完成"}},lintRules:[{id:"L2-agenda-not-mapped",when:"Store.getAgendaFulfillment(4) is empty AND Store.getAgendas().length > 0",severity:"high",onTriggerUI:"选项 agenda-mapping 加「议程回响待补」pill"},{id:"forbidden-goal-bloat",when:"decision.userChoice === 'more'",severity:"medium",onTriggerUI:"选项 more 显示「目标稀释」徽章"}],horizontalLayerHooks:{L1:{visible:!1,reason:"L1 锚点在 7/9"},L2:{visible:!0,role:"echo-2nd",echoMode:"goal-mapping",writesTo:"Store.agendaFulfillment[4]"},L3:{visible:!0,sticky:!0,minimizedHeight:32,role:"convergence"}},persistence:{userJudgments:{path:"userJudgments[4]"},artifactLibrary:{path:"artifactLibrary"},agendaFulfillment:{path:"station3.agendaFulfillment[4]",readers:[11]},qualityCheckpoints:{backendMappingTo20Steps:["教学目标","学习成果","评价证据","目标对齐"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[4]=v(N)}(window),function(h){"use strict";const N={id:5,version:"stages-v4",parentStageId:"S3",subNodeKey:"5",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:4,label:"学习目标",key:"目标 + 评价证据",snippet:"能识别 SWOT 各维证据来源，完成 TOWS 推导 + 批判 SWOT 局限"}],outputsTo:[{stationId:6,label:"案例",outKey:"问题链 → 案例切入点"},{stationId:7,label:"时间线",outKey:"问题链 → 30 分钟实战节奏"}]},narrative:{what:"把教材内容重构为问题链、概念链和任务链，帮助学生围绕真实问题推进学习。",why:"直接按教材顺序讲会退化为概念讲授；药事管理课堂应围绕事实、证据、判断、策略和风险组织内容。",how:"查看 6 层方法论严谨链 + 关键误区清单，选择内容组织方式，生成课堂问题链与概念边界说明。"},evidenceFigure:{title:"6 层方法论严谨链 + 关键误区清单",subtitle:"看学生最易卡在哪个误区",evidenceNote:"问题链每升一层，学生认知负荷上升一档；卡点恰是教学高价值点。",questionChain:[{lvl:1,type:"事实",text:"什么是 SWOT 四象限？",difficulty:"low",blocking:.05},{lvl:2,type:"机制",text:"什么算「内部」？什么算「外部」？",difficulty:"med",blocking:.42},{lvl:3,type:"证据",text:"每条 SWOT 必须配什么证据？",difficulty:"high",blocking:.58},{lvl:4,type:"权重",text:"列出 20 条后，哪 3 条最重要？",difficulty:"high",blocking:.48},{lvl:5,type:"应用",text:"SWOT 本身不产策略，TOWS 才产——怎么推 TOWS？",difficulty:"v.high",blocking:.62},{lvl:6,type:"批判",text:"SWOT 工具本身有哪些局限？",difficulty:"v.high",blocking:.72}],keyMisconceptions:[{key:"policy-in-W",text:"政策威胁被塞进 W 维（应是 T）",frequency:.38,stage:"lvl-2",intervention:"在导入段用一道判断题专测「内/外因边界」（如「集采降价 30% 归入 W 还是 T？」）。课前别在讲授里提示，否则会变成「记忆题」而非「概念判断题」。"},{key:"adjective-only",text:"条目用形容词「质量好 / 管理强」无数据",frequency:.62,stage:"lvl-3",intervention:"在小组任务说明里硬性要求「每条 SWOT 必须引用 1 个具体数字 + 1 个来源（年报/政策号/行业排名）」。可在协作前先给一份「合格条目示例 vs 不合格示例」对照卡。"},{key:"laundry-list",text:"条目超 10 条流水账无权重",frequency:.45,stage:"lvl-4",intervention:"限制单象限条目数（≤6 条）并强制「三选一」权重排序。在 Z2 锚点（28'）做一次「请你的小组挑出 1 条最关键的 W 维」的实时筛选。"},{key:"no-tows",text:"做完 SWOT 不做 TOWS 直接出战略",frequency:.62,stage:"lvl-5",intervention:"把任务表述改为「SWOT-TOWS 二步走」并把 TOWS 列为独立量规维度（占 24%）。展示阶段强制每组展示一个 SO/WT 战略矩阵。"},{key:"no-self-critique",text:"完全不指出 SWOT 工具局限",frequency:.78,stage:"lvl-6",intervention:"在小结段（38'-42'）专门留 4 分钟做「工具批判圆桌」，由教师抛出 2 条挑战（如「SWOT 没有时间维度」「内外边界模糊」），要求学生现场回应；写入「批判意识」量规维度（占 28%）。"}],bars:[["按方法论严谨链 (6 层)",88,{status:"ok",source:"推荐：每层 1 题，最后批判工具"}],["按教材章节顺序",42,{status:"warn",source:"覆盖全但易退回讲授"}],["按案例驱动",68,{status:"ok",source:"情境感强但概念跳跃"}],["按学生议程倒推",72,{status:"ok",source:"回响 议程贯通"}]],flow:["看链条","标误区","排问题链"]},decision:{question:"本课内容重构的主线应是什么？",options:[{key:"chain",label:"按方法论严谨链 6 层组织（事实→机制→证据→权重→TOWS→批判）",rationale:"命中 SWOT 课最大失分区：3/6 个误区都在第 3 / 5 / 6 层。逐层推进可显式触发每个误区。",score:3.8,meta:{recommended:!0}},{key:"agenda-reverse",label:"按学生议程倒推",rationale:"回响 议程贯通（学习者议程 的 5 条议程作为问题起点）。但议程并非按方法论严谨度排序，可能跳过基础误区。",score:3.5},{key:"case",label:"按华海药业案例情境驱动",rationale:"情境感强，但概念跳跃风险高（学生可能记住「华海」却不会迁移到其他企业）。",score:3},{key:"textbook",label:"按教材章节顺序逐段讲授",rationale:"结构清楚但容易退回概念讲授；违反 contract 中「不得退化为概念讲授」原则。",score:2.1,meta:{lintTriggers:["forbidden-lecture-style"]}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{chain:{summary:"✓ 触发所有 5 类误区",riskBadges:["方法论主链"],detail:"选此后建议案例与证据环节 案例每条 SWOT 显式标注「事实 / 政策 / 数据 / 角色 / 风险边界」5 类标签，对应第 3 层证据要求。"},"agenda-reverse":{summary:"✓ 议程深度联动",riskBadges:["议程联动"],detail:"5 条议程将映射为问题链 1-5 题。但需在第 6 题强制加批判（议程通常不会自带）。"},case:{summary:"△ 迁移性弱",riskBadges:["概念跳跃"],detail:"建议改用 chain 主线 + 华海作为单一案例锚（而非主线）。"},textbook:{summary:"✕ 违反「不得退化讲授」禁条",riskBadges:["禁条触发"],detail:"教材顺序会让 30 分钟实战段被压缩。"}},artifacts:[{id:"question-chain",buttonLabel:"⬇ 生成 6 层方法论严谨链问题链",outputTitle:"课堂问题链 v1 · 6 层方法论严谨链",outputCue:"把 6 层方法论严谨度排成 6 道课堂问题，每道触发一类典型误区。",artifactLines:{evidence:"6 层难度阶梯：lvl-1 卡点 5% → lvl-6 卡点 72%。高价值教学点集中在 3/5/6 层。",action:"为每层准备 1 道触发性问题 + 1 条预设反例；第 6 层必须落到「SWOT 工具局限」。",constraints:["≤ 6 题（避免认知过载）","每题必须显式对应 1 类误区","第 6 题必须问工具批判（区分本科与中专培训的关键）"]},writeback:{to:"artifactLibrary"}},{id:"concept-map",buttonLabel:"⬇ 生成概念边界说明 + 关键误区清单",outputTitle:"概念边界说明 v1",outputCue:"为学生提供「内 / 外 · 事实 / 立场 · 现状 / 趋势」3 组关键边界判断卡。",artifactLines:{evidence:"5 类高频误区集中在 lvl-2 / lvl-3 / lvl-5 / lvl-6；最高 78% 学生完全不批判 SWOT 工具。",action:"把 5 类误区编为「正反例对照卡」嵌入案例与证据环节 案例材料 + 课中调控环节 ZPD 锚点测温题。",constraints:["每个误区配 1 个正例 + 1 个反例","误区频率 > 50% 必须进入课中调控环节 ZPD 测温","概念边界须用药事管理情境（非通用商科）"]},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 目标与量规环节 目标判断未保存"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断 · 数据流入案例与证据环节 / 7"},E:{id:"artifactDone",desc:"已生成问题链 + 概念边界说明"}},lintRules:[{id:"forbidden-lecture-style",when:"decision.userChoice === 'textbook'",severity:"medium",onTriggerUI:"选项 textbook 显示「退化讲授」徽章"}],horizontalLayerHooks:{L1:{visible:!1,reason:"L1 锚点在 S5/S6"},L2:{visible:!1,reason:"L2 议程在 S1/S2/S4/S5/S8 回响（S3 不直接处理议程）"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[5]"},artifactLibrary:{path:"artifactLibrary"},qualityCheckpoints:{backendMappingTo20Steps:["核心概念","重点难点","问题链","认知负荷"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[5]=v(N)}(window),function(h){"use strict";const N={id:6,version:"phase11-v3",parentStageId:"S4",subNodeKey:"6",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},enterCondition:{requires:[{stationId:4,key:"judgmentSaved"},{stationId:3,key:"agendaCollected"}]},exitCondition:{requires:[{type:"judgmentSaved",stationId:6},{type:"anyArtifactGenerated",count:1}]},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:3,label:"议程协商",key:"学生议程协商单",snippet:"5 条核心关切 · 含「集采降价合理性」「创新药挤压」「2018 杂质事件影响」"},{stationId:4,label:"学习目标",key:"学习目标",snippet:"能识别 SWOT 各维度的证据来源类型，并完成 TOWS 推导"},{stationId:5,label:"问题链",key:"概念边界说明",snippet:"方法论严谨链 6 层 · 重点：内外分类 / 证据出处 / 权重 / TOWS / 工具批判"}],outputsTo:[{stationId:8,label:"探究协作",outKey:"案例材料 → 协作任务单"}],drawerFullContent:!0},narrative:{what:"准备药事管理案例、政策材料、数据资料、任务单和证据模板；显式回应学习者议程 议程中的伦理/政策关切。",why:"案例必须包含事实、政策、数据、利益相关者和风险边界。加入「议程对照表」，强制把学生议程关切体现为可引用证据。",how:"查看案例证据密度图 + 议程对照表，判断材料是否覆盖事实/政策/数据/角色/风险/议程关切六类。"},evidenceFigure:{title:"案例证据密度图 — 华海药业 SWOT 材料包覆盖度",subtitle:"看案例证据是否够用",evidenceNote:"案例不是背景故事，而是学生判断的证据来源。",dataNotice:{type:"example",text:"⚠ 当前显示为华海药业样例数据。上传自己的案例材料后，证据密度将基于实际内容自动重算。",showWhenNoUserUpload:!0},bars:[["S 维证据",80,{source:"年报研发章节 + ANDA 数量榜单",status:"ok"}],["W 维证据",42,{source:"2018 缬沙坦事件简报 + 毛利率表",status:"warn",warnText:"事件已 8 年，需补充近期修复进展"}],["O 维证据",76,{source:"国务院仿制药意见 + 集采扩围公告",status:"ok"}],["T 维证据",70,{source:"印度同行数据 + 创新药企竞争",status:"ok"}],["角色立场",38,{source:"缺患者/医保局立场材料",status:"miss"}],["风险边界",34,{source:"缺企业违规边界材料",status:"miss"}]],agendaCoverageDots:[{agendaKey:"ethics-pricing",label:"集采降价合理性",covered:!0,evidenceSrc:"国家医保局历批降幅公告"},{agendaKey:"innovation-press",label:"创新药企挤压",covered:!0,evidenceSrc:"百济神州 / 恒瑞年报对照"},{agendaKey:"valsartan-trust",label:"2018 事件信任修复",covered:!1,evidenceSrc:null},{agendaKey:"api-export",label:"原料药出海前景",covered:!0,evidenceSrc:"海关出口数据片段"},{agendaKey:"cdmo-window",label:"CDMO 机遇判断",covered:!1,evidenceSrc:null}],flow:["看密度","查议程","补证据"],renderRules:{ok:{color:"#3a8a4e",style:"solid",badge:"✓"},warn:{color:"#b8860b",style:"stripe",badge:"⚠"},miss:{color:"#a23a3a",style:"dash",badge:"✕"},dotCovered:{color:"#3a8a4e",fill:"solid"},dotUncovered:{color:"#a23a3a",fill:"none"}}},agendaEchoCard:{layerId:"L2",borderColor:"amber",source:"来自学习者议程 · 学生议程协商单",totalAgendas:5,coveredCount:3,uncoveredCount:2,uncoveredList:[{key:"valsartan-trust",text:"2018 缬沙坦事件后，公司信任修复到什么程度？",suggestAction:"补充：FDA 近 2 年针对华海的检查记录 / 出口量恢复曲线"},{key:"cdmo-window",text:"华海能否切入 CDMO 业务对冲集采压力？",suggestAction:"补充：公司近年 CDMO 业务披露 / 行业 CDMO 龙头对照"}],hardConstraint:"议程进入目标与量规环节/6/8/11 时必须显式回应（可填可空，留空进入复盘风险列表）",writeback:{toStation:3,toKey:"agendaFulfillment[6]",triggerStation11Risk:!0}},decision:{question:"案例材料最需要先处理什么问题？",options:[{key:"agenda-fill",label:"把未兑现的 2 条学生议程对应的证据补齐",rationale:"命中 议程贯通硬约束。议程被采集却无证据对应，会让学习者议程 的协商承诺退化为「调查表」。",score:3.9,meta:{recommended:!0,lintTriggers:["L2-uncovered"],v3New:!0}},{key:"tag",label:"为现有材料标注事实/政策/数据/角色/风险边界 5 类标签",rationale:"能让学生每条 SWOT 判断都有证据来源。但当前更紧迫的是议程兑现。",score:3.4},{key:"more",label:"继续增加背景材料，让案例更丰满",rationale:"材料越多不一定越好。证据图显示 S/O/T 维已 ≥70%，再加会压垮学生 30 分钟实战节奏。",score:1.9,meta:{lintTriggers:["material-overload"]}},{key:"answer",label:"直接给出参考 SWOT 答案，降低学生难度",rationale:"会削弱学生探究和论证，违反 contract「不得退化为知识问答」的禁条。",score:1.4,meta:{lintTriggers:["forbidden-spoonfeed"],blockSave:!0}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{"agenda-fill":{summary:"✓ 命中议程兑现度风险",riskBadges:["议程兑现","高优先级"],detail:"选择此项后，请去学习者议程 议程列表标记「已被案例与证据环节 兑现」，并在产物生成中输出「议程—证据对照表」。",nextStationHint:"完成后进入协作任务环节 时，议程角色匹配会自动加载这 5 条议程作为角色意愿候选。"},tag:{summary:"△ 方向正确但顺序不佳",riskBadges:["建议次轮再做"],detail:"标签化是高价值动作，但应在议程兑现之后。建议本节点先选 A，标签化在协作任务环节 协作任务单生成时一并完成。"},more:{summary:"✕ 材料过载风险",riskBadges:["认知负荷","时间挤压"],detail:"证据图显示 S/O/T 三象限证据已充足。继续增加材料会让 30 分钟实战阶段无法完成 TOWS。"},answer:{summary:"✕ 违反 contract 禁条",riskBadges:["禁条触发"],detail:"引申自 FORBIDDEN_CHANGES「不得把 SWOT 当作产品总主题」：不得把案例退化为知识问答。",blockSave:!0}},artifacts:[{id:"case-material-list",buttonLabel:"⬇ 生成华海药业材料清单（15 份，按 SWOT 象限组织）",outputTitle:"案例材料清单 · 华海药业 SWOT",outputCue:"把案例材料转成可提取、可追溯的证据包。",artifactLines:{evidence:"案例已具备 S/O/T 三象限的事实与政策证据，但 W 维近期数据偏老（2018），且角色立场与风险边界仍待补充。",action:"为材料标注事实/政策/数据/角色/风险边界 5 类标签，并要求学生每条 SWOT 判断引用至少 1 条材料证据。",constraints:["材料必须有可引用事实","不能让学生凭个人经验完成判断","案例边界必须写入任务说明","W 维证据需含 2024 年后修复进展"]},payload:{counts:{S:4,W:3,O:4,T:4},sourceDirectory:"教学资产库 / 案例 / 华海药业 / v1"},writeback:{to:"artifactLibrary"}},{id:"agenda-evidence-map",buttonLabel:"⬇ 生成议程—证据对照表",outputTitle:"议程兑现表 · 案例与证据环节 输出",outputCue:"标记每条议程是否在材料中获得证据对应。",template:{columns:["议程 key","议程文本","对应证据来源","兑现状态","教师批注"],rows:{generateFrom:"evidenceFigure.agendaCoverageDots"}},writeback:{to:"station3.agendaFulfillment[6]",visibleAtStations:[11]}}],stateMachine:{A:{id:"locked",desc:"未进入 · enterCondition 未满足",ui:"灰色 tile + 锁定图标"},B:{id:"entered",desc:"已进入未判断",ui:"全显示 · 产物按钮 disabled"},C:{id:"selected",desc:"已选未保存",ui:"反馈区展开 · 产物按钮 enabled · blockSave 时保存 disabled"},D:{id:"saved",desc:"已保存判断",ui:"tile 变绿勾 · 滚到产物区"},E:{id:"artifactDone",desc:"已生成产物",ui:"按钮变「已生成 ✓」· 显示「前往协作任务环节」CTA"}},lintRules:[{id:"L2-uncovered",when:"agendaEchoCard.uncoveredCount > 0",severity:"high",onTriggerUI:"在选项 agenda-fill 上加「推荐」pill + 列入复盘风险"},{id:"material-overload",when:"evidenceFigure.bars.filter(b => b[2].status === 'ok').length >= 4",severity:"medium",onTriggerUI:"选项 more 标灰 + 显示「认知负荷」徽章"},{id:"forbidden-spoonfeed",when:"decision.userChoice === 'answer'",severity:"block",onTriggerUI:"保存按钮 disabled + 红色违规框"}],horizontalLayerHooks:{L1:{visible:!1,reason:"本节点不是 L1 主战场（学情触发在 7/8/9）"},L2:{visible:!0,writebackKey:"globalAgendaRisk",triggerStation11Risk:!0,topBarSyncText:"议程已加载 · {totalAgendas} 条 · 案例与证据环节 兑现 {coveredCount}/{totalAgendas}"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[6]",shape:{key:"string",timestamp:"iso",score:"number"}},artifactLibrary:{path:"artifactLibrary",shape:{stationId:6,artifactId:"string",html:"string",md:"string"}},agendaFulfillment:{path:"station3.agendaFulfillment[6]",readers:[11]},qualityCheckpoints:{backendMappingTo20Steps:["案例材料","政策数据","证据模板","来源边界","议程兑现"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[6]=v(N)}(window),function(h){"use strict";const N={id:7,version:"phase11-v3",parentStageId:"S5",subNodeKey:"7",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:4,label:"学习目标",key:"学习目标",snippet:"30 分钟内输出带证据带权重带 TOWS 的 SWOT"},{stationId:5,label:"问题链",key:"方法论严谨链",snippet:"6 层 · 重点 内外分类 / 证据 / 权重 / TOWS / 工具批判"}],outputsTo:[{stationId:8,label:"探究协作",outKey:"时间线 → 实战段 25–55'"},{stationId:9,label:"形成性评价",outKey:"3 个 学情校准点 → 学情触发规则"}]},narrative:{what:"设计课堂导入、概念支架、案例分析、小组展示、反馈修正和总结迁移的时间结构，并在时间线上放 ≥ 3 个 学情校准点。",why:"光定讲授/分析/协作比例还不够——课堂上必须预留具体时刻供教师停下来判断'学生跟上没有'。校准点位置由教师定，学情触发规则在课中调控环节编辑。",how:"查看 45 分钟时间轴，调整讲授/分析/协作/反馈比例，并在轴上标记 ≥ 3 个 学情校准点（覆盖早期诊断 / 实战段中点 / 收束封闭三阶段）。"},evidenceFigure:{title:"45 分钟课堂时间轴（含 3 个 学情校准点）",subtitle:"看 45 分钟如何分配",evidenceNote:"时间线决定学生有没有机会完成高阶判断；锚点必须分布在前、中、后三段，避免末端集中。",bars:[["讲授",27,{status:"ok",source:"压缩到 27%（约 12 min）"}],["分析",31,{status:"ok",source:"案例精读 + 法条分析（约 14 min）"}],["协作",29,{status:"ok",source:"13 min 微 SWOT 实战"}],["反馈",13,{status:"warn",source:"学情触发反馈预算偏紧（约 6 min）"}]],timeline:[{t:0,type:"phase",label:"故事锚 · 泽布替尼悬念切入"},{t:5,type:"phase",label:"法条锚 · 精读第 30 条"},{t:10,type:"anchor",anchorId:"Z1",label:"Z1 · 条文理解测温（早期诊断）"},{t:12,type:"phase",label:"推演锚 · 微实战段开始"},{t:25,type:"phase",label:"微实战段结束"},{t:28,type:"anchor",anchorId:"Z2",label:"Z2 · 推演后即时投票（实战段中点）"},{t:30,type:"phase",label:"比较锚 · 中美欧对照"},{t:38,type:"phase",label:"小结启动"},{t:42,type:"anchor",anchorId:"Z3",label:"Z3 · 知识封闭测温（收束封闭）"},{t:45,type:"phase",label:"下课 + 沉淀任务"}],zpdAnchors:[{id:"Z1",t:10,label:"条文理解测温",format:"雨课堂 5 题单选"},{id:"Z2",t:28,label:"推演后即时投票",format:"推演裁决投票 + 理由词云"},{id:"Z3",t:42,label:"知识封闭测温",format:"MAH/MA/生产证关系判断"}],flow:["压讲授","扩分析","钉锚点"]},decision:{question:"45 分钟课堂最需要修正的结构问题是什么？",options:[{key:"student",label:"压缩讲授，增加证据分析和反馈修正时间",rationale:"更符合高阶参与和形成性评价要求。",score:3.8,meta:{recommended:!0}},{key:"anchors-only",label:"保留讲授比例，但加密 学情校准点（≥ 3 个）",rationale:"锚点能改善学情可见度，但不能弥补时间结构本身的失衡。",score:2.9},{key:"lecture",label:"延长教师讲授，保证内容覆盖",rationale:"内容覆盖不等于学习发生。",score:1.8,meta:{lintTriggers:["forbidden-lecture-heavy"]}},{key:"free",label:"扩大自由讨论，弱化量规约束",rationale:"讨论会热闹，但证据质量难保证。",score:2}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{student:{summary:"✓ 符合 ICAP + 形成性评价",riskBadges:["高阶参与","学情校准点定义"],detail:"选择此项后，3 个 学情校准点会落入课中调控环节 等待学情触发规则编辑。下游课中调控环节 不允许在锚点决策规则为空时通过。"},"anchors-only":{summary:"△ 治标不治本",riskBadges:["建议先压讲授"],detail:"锚点能采集学情触发数据，但若讲授占比仍 ≥ 45%，学生根本没机会暴露 ZPD。"},lecture:{summary:"✕ ICAP 塌缩",riskBadges:["认知参与塌缩"],detail:"讲授为主退回 Passive 层，违反 contract「不得退化为概念讲授」的精神。"},free:{summary:"✕ 证据塌缩",riskBadges:["证据质量塌缩"],detail:"失去量规约束，无法支撑后续评价证据收集。"}},artifacts:[{id:"timeline-with-anchors",buttonLabel:"⬇ 生成 45 分钟课堂时间表 + 3 个 学情校准点",outputTitle:"45 分钟课堂流程表",outputCue:"把时间从教师讲授转向学生证据分析，并钉上 3 个 学情校准点（前/中/后均匀分布）。",artifactLines:{evidence:"原始安排讲授占比偏高，案例分析和反馈修正时间不足。",action:"讲授 27% / 分析 31% / 协作 29% / 反馈 13%，并在 10'/28'/42' 设 3 个 学情校准点。",constraints:["讲授只保留必要支架","核心时间给学生产出","每个活动必须留下评价证据","≥ 3 个 学情校准点必须落在不同教学阶段（前 1/3 / 中 1/3 / 后 1/3）"]},sideEffect:"writeZpdAnchors",writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断"},E:{id:"artifactDone",desc:"已生成时间表 · 3 个 学情校准点已写入 Store"}},lintRules:[{id:"forbidden-lecture-heavy",when:"decision.userChoice === 'lecture'",severity:"medium",onTriggerUI:"选项 lecture 显示「ICAP 塌缩」徽章"},{id:"zpd-count-insufficient",when:"zpdAnchors.length < 3",severity:"block",onTriggerUI:"阻止保存 · 不得少于 3 个锚点"}],horizontalLayerHooks:{L1:{visible:!0,role:"definition",anchorCount:3},L2:{visible:!1,reason:"L2 在目标与量规环节/6/8/11 回响，任务链环节 不直接处理议程"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[7]"},artifactLibrary:{path:"artifactLibrary"},zpdAnchors:{path:"zpdAnchors",readers:[9,11]},qualityCheckpoints:{backendMappingTo20Steps:["问题导入","概念支架","案例探究","展示总结","时间结构","学情校准点"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[7]=v(N)}(window),function(h){"use strict";const N={id:8,version:"phase11-v3",parentStageId:"S5",subNodeKey:"8",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},enterCondition:{requires:[{stationId:6,key:"judgmentSaved"},{stationId:7,key:"judgmentSaved"}]},exitCondition:{requires:[{type:"judgmentSaved",stationId:8},{type:"anyArtifactGenerated",count:1}]},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:3,label:"议程协商",key:"学生议程协商单",snippet:"5 条核心关切（来自学习者议程）· 含角色意愿"},{stationId:6,label:"情境化案例",key:"议程—证据对照表 / 材料清单",snippet:"华海药业 SWOT 材料包 15 份 · 议程兑现度数据"},{stationId:7,label:"时间线",key:"课堂时间表 + ZPD 锚点",snippet:"25–55 分钟实战段 · 30 分钟做 SWOT + TOWS"}],outputsTo:[{stationId:9,label:"形成性评价",outKey:"探究产出 → 学情触发反馈规则"},{stationId:10,label:"表现性评价",outKey:"学生作品 → 量规评分"}],drawerFullContent:!0},narrative:{what:"设计学生如何围绕华海药业 SWOT 案例进行事实提取、证据判断、小组协作和成果展示；角色分配参考学习者议程 的学生意愿。",why:"4 角色任务角色分配未与学生议程联动。把学习者议程 中学生表达的角色意愿成为分配参考——这是 议程贯通的第 3 个回响点。",how:"查看小组任务泳道图 + 议程—角色匹配矩阵，判断每个小组角色是否有明确任务和产出，生成协作任务单和教师巡视提示。"},evidenceFigure:{title:"小组协作泳道图 + 议程—角色匹配矩阵",subtitle:"看小组是否真的协作 · 角色分配是否回应议程",evidenceNote:"协作不是分组讨论，而是每个角色都有证据产出，且角色与学生意愿对应。",bars:[["资料员",72,{source:"财报 + 集采数据提取",status:"ok",timeBudget:"实战 13 min · 资料员先行 3 min 提取关键数据"}],["判断员",66,{source:"SWOT 内外分类 + TOWS",status:"ok",timeBudget:"资料员后 5 min · 与质询员交叉判断"}],["质询员",48,{source:"证据强度追问",status:"warn",warnText:"质询员任务最易塌缩",timeBudget:"全程 13 min · 实时追问，需脚本支撑"}],["汇报员",58,{source:"综合表达 + 战略输出",status:"ok",timeBudget:"末 3 min · 收束 SO/WT 战略矩阵"}]],roleTimeBudget:{totalRoleMin:13,sequence:[{t:0,end:3,primaryRole:"资料员",desc:"提取年报研发投入 / 集采降幅 / 出口数据 3 条核心证据"},{t:3,end:8,primaryRole:"判断员",desc:"完成 SWOT 四象限填表，质询员交叉追问证据出处"},{t:8,end:10,primaryRole:"判断员",desc:"TOWS 推导（SO / WT 二选一）"},{t:10,end:13,primaryRole:"汇报员",desc:"整理 1 张展示卡：1 条 SWOT 最强项 + 1 条 TOWS 战略"}],note:"若某组质询员能力弱，建议教师巡视时主动追问该组，弥补脚本不足。"},roleSuggestions:[{agendaKey:"ethics-pricing",agendaText:"集采降价合理性",suggestedRole:"判断员",reason:"需要做政策对比判断"},{agendaKey:"innovation-press",agendaText:"创新药企挤压",suggestedRole:"资料员",reason:"需要查恒瑞 / 百济对照数据"},{agendaKey:"valsartan-trust",agendaText:"2018 事件信任修复",suggestedRole:"质询员",reason:"追问 W 维证据强度"},{agendaKey:"api-export",agendaText:"原料药出海前景",suggestedRole:"判断员",reason:"O 维趋势判断"},{agendaKey:"cdmo-window",agendaText:"CDMO 机遇判断",suggestedRole:"汇报员",reason:"综合战略表达"}],flow:["看任务","对议程","配角色"],renderRules:{ok:{color:"#3a8a4e",style:"solid",badge:"✓"},warn:{color:"#b8860b",style:"stripe",badge:"⚠"},miss:{color:"#a23a3a",style:"dash",badge:"✕"}}},agendaEchoCard:{layerId:"L2",borderColor:"amber",source:"来自学习者议程 · 议程意愿 · 已被案例与证据环节 兑现 3/5",mode:"role-mapping",hint:"本节点把议程映射到 4 个协作角色。点击「生成协作任务单」后，所有 5 条议程会被标记为'角色匹配完成'。",writeback:{toStation:8,toKey:"agendaFulfillment[8]",triggerStation11Risk:!0}},decision:{question:"小组协作最需要补强哪一项？",options:[{key:"agenda-role-match",label:"让学习者议程 的学生角色意愿成为本节角色分配的参考",rationale:"命中 议程贯通的第 3 个回响点。若学生在议程中表达「我想演患者律师」却被随机分配，会让议程承诺落空。",score:3.9,meta:{recommended:!0,lintTriggers:["L2-agenda-role-mismatch"],v3New:!0}},{key:"roles",label:"为每个角色（资料员/判断员/质询员/汇报员）设置独立证据产出",rationale:"能避免小组讨论由少数学生包办，但若不联动议程意愿，仍可能错配。",score:3.4},{key:"leader",label:"指定组长完成主要任务",rationale:"效率高但协作必要性不足。会让 3/4 学生失去证据产出机会。",score:1.8,meta:{lintTriggers:["forbidden-leader-only"]}},{key:"random",label:"随机分组后自由讨论",rationale:"灵活但过程证据薄弱，议程意愿被完全忽略。",score:2,meta:{lintTriggers:["L2-agenda-role-mismatch"]}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{"agenda-role-match":{summary:"✓ 命中 议程贯通的第 3 回响点",riskBadges:["议程闭环","高优先级"],detail:"选择此项后，议程—角色匹配矩阵将被写入协作任务单。下游 S8 复盘与决策会显示该议程的最终落点。",nextStationHint:"进入课中调控环节 时，3 个 ZPD 锚点的学情触发规则会针对 4 个角色分别设计。"},roles:{summary:"△ 方向正确但缺议程闭环",riskBadges:["建议加 A 项"],detail:"独立证据产出是基础动作。建议本节点先选 A（议程—角色匹配），再以「roles」原则细化任务卡。"},leader:{summary:"✕ 协作塌缩风险",riskBadges:["认知参与塌缩","议程贯通失效"],detail:"指定组长会让 3/4 学生失去证据产出，违反 ICAP 原则中的 Constructive/Interactive 层。"},random:{summary:"✕ 议程承诺落空风险",riskBadges:["L2 失效"],detail:"随机分组使学习者议程 的角色意愿完全被忽略——议程贯通的硬约束被违反。"}},artifacts:[{id:"role-task-card",buttonLabel:"⬇ 生成 4 角色协作任务单（含议程映射）",outputTitle:"小组协作任务单 · 4 角色 × 5 议程",outputCue:"把小组讨论改造成有角色、有证据、有议程映射的协作任务。",artifactLines:{evidence:"当前 4 角色密度均衡（资料员 72 / 判断员 66 / 质询员 48 / 汇报员 58），质询员略弱需补脚本。",action:"为 4 角色分别配证据产出 + 议程映射；质询员附「证据强度追问 5 句」脚本。",constraints:["每名学生必须有可见贡献","小组产出必须可追溯","教师追问聚焦证据质量","至少 3 条议程在角色任务中显式照应"]},sideEffect:"markAgendaRoleMatched",writeback:{to:"artifactLibrary"}},{id:"teacher-roving-prompts",buttonLabel:"⬇ 生成教师巡视追问提示卡（4 角色 × 高频卡点）",outputTitle:"教师巡视与追问提示",outputCue:"把巡视从「看气氛」变成「按角色定向追问」。",artifactLines:{evidence:"30 分钟实战中，教师巡视若无脚本，会偏向参与活跃组、忽略沉默组。",action:"为每角色准备 2 句追问模板（如「质询员请指出对方证据中最弱的一条」）。",constraints:["追问必须指向证据而非观点","追问必须覆盖每组每角色至少 1 次","追问要为课中调控环节 学情触发采集留接口"]},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 案例与证据环节/7 判断未保存"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断"},E:{id:"artifactDone",desc:"已生成协作任务单 · L2 议程角色匹配完成"}},lintRules:[{id:"L2-agenda-role-mismatch",when:"decision.userChoice in ['random'] OR agendaFulfillment[8] is empty",severity:"high",onTriggerUI:"在选项 agenda-role-match 上加「推荐」pill"},{id:"forbidden-leader-only",when:"decision.userChoice === 'leader'",severity:"medium",onTriggerUI:"选项 leader 显示「协作塌缩」徽章"}],horizontalLayerHooks:{L1:{visible:!1,reason:"锚点在任务链环节 定义、课中调控环节 编辑规则；协作任务环节 是学情触发面"},L2:{visible:!0,echoMode:"role-mapping",topBarSyncText:"议程已加载 · {totalAgendas} 条 · 案例与证据环节 兑现 {fulfilledAt6}/{totalAgendas} · 协作任务环节 待匹配 {pendingAt8}"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[8]"},artifactLibrary:{path:"artifactLibrary"},agendaFulfillment:{path:"station3.agendaFulfillment[8]",readers:[11],shape:{role:"string",agendaKey:"string",studentIntent:"string?"}},qualityCheckpoints:{backendMappingTo20Steps:["协作分工","角色任务","证据分析","教师巡视","展示追问","议程角色匹配"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[8]=v(N)}(window),function(h){"use strict";const N={id:9,version:"phase11-v3",parentStageId:"S6",subNodeKey:"9",exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:7,label:"时间线",key:"3 个 学情校准点位置",snippet:"Z1 10' 条文测温 · Z2 28' 推演投票 · Z3 42' 知识封闭测温（45 min 课堂）"},{stationId:8,label:"探究协作",key:"协作产出",snippet:"4 角色 × 5 议程映射 · SWOT + TOWS 实战段产出"}],outputsTo:[{stationId:11,label:"教学反思",outKey:"学情触发规则 + 触发记录 → 复盘报告"}]},narrative:{what:"为任务链环节 时间线上的 3 个 学情校准点设计微评估格式（≤ 3 min），并为每个锚点写一条「如果 X 则 Y」的反馈—调节规则。",why:"光设触发点不够——每个校准点必须有可执行的决策规则，教师才能在 1 分钟内判断「继续/暂停/重启」。",how:"查看 3 个锚点位置 + 微评估格式，为每个锚点编辑一条「如果 X 则 Y」规则，生成学情触发规则表。"},evidenceFigure:{title:"3 个 学情校准点的学情触发规则设计板",subtitle:"看每个锚点的反馈—调节规则",evidenceNote:"锚点没有规则等于没有锚点；规则没有阈值等于没有规则。",bars:[["Z1 · 条文测温",0,{status:"miss",source:"尚未编辑规则"}],["Z2 · 推演投票",0,{status:"miss",source:"尚未编辑规则"}],["Z3 · 知识测温",0,{status:"miss",source:"尚未编辑规则"}]],pulseRules:[{anchorId:"Z1",t:10,microFormat:"雨课堂 5 题单选 · ≤ 3 min",ifCond:"条文正确率 < 70%",thenAct:"回炉精讲《药品管理法》第 30 条，并要求学生口头复述「持有人 vs 生产者」差异"},{anchorId:"Z2",t:28,microFormat:"推演裁决投票 + 理由词云 · ≤ 3 min",ifCond:"争议票数差距 < 15%（即学生分歧显著）",thenAct:"延伸 3 分钟立场切换辩论，让支持方与反对方角色互换"},{anchorId:"Z3",t:42,microFormat:"MAH/MA/生产证 3 选 1 判断 · ≤ 2 min",ifCond:"错误率 > 30%",thenAct:"次节课首 5 分钟回炉，并在期末考前再做 1 次同题测温"}],flow:["看锚点","写规则","定阈值"]},decision:{question:"3 个 学情校准点中，哪个的学情触发—反馈规则最关键？",options:[{key:"z1-concept",label:"Z1 条文理解（10'）· 防止学生带着误区进入推演",rationale:"推演若建立在错误条文理解上，12-25 分钟微实战段全部浪费。Z1 是最高 ROI 锚点。",score:3.9,meta:{recommended:!0}},{key:"z2-controversy",label:"Z2 推演分歧（28'）· 把分歧转化为学习机会",rationale:"分歧本身就是 ZPD 信号。但若 Z1 未保证理解，Z2 的分歧反而是误区扩散。",score:3.2},{key:"z3-closure",label:"Z3 知识封闭（42'）· 检测最终学习成果",rationale:"终结性测试价值有限——出问题时已无课内补救空间。",score:2.4},{key:"none",label:"不必每个都写规则，课堂临场判断即可",rationale:"违反 contract L1 硬约束：每个锚点必须有「如果 X 则 Y」规则。",score:1.2,meta:{lintTriggers:["L1-rule-missing"],blockSave:!0}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{"z1-concept":{summary:"✓ 最高 ROI 选择",riskBadges:["关键学情锚"],detail:"Z1 是误区扩散的最后防线。建议规则阈值 70%。"},"z2-controversy":{summary:"△ 价值高但顺序不佳",riskBadges:["建议先 Z1"],detail:"推演分歧需要建立在条文理解之上才有教学价值。"},"z3-closure":{summary:"△ 终结性价值有限",riskBadges:["反馈过晚"],detail:"Z3 仅能为下一节课提供改进信号，对本节学习已无救治空间。"},none:{summary:"✕ 违反 学情触发硬约束",riskBadges:["禁条触发"],detail:"每个学情校准点必须有「如果 X 则 Y」规则（来自 contract.HORIZONTAL_LAYERS.L1.hardConstraint），否则课中调控环节不允许通过。",blockSave:!0}},artifacts:[{id:"pulse-rule-table",buttonLabel:"⬇ 生成 3 个 学情校准点的学情触发—反馈—调节规则表",outputTitle:"学情触发规则表 · 3 个 学情校准点",outputCue:"把每个锚点变成可执行的课堂决策规则。",artifactLines:{evidence:"目前 3 个锚点尚无规则（status: miss）；课堂将退化为「教师凭感觉调节」。",action:"为 Z1/Z2/Z3 分别写 microFormat + ifCond + thenAct，确保阈值可量化、动作可执行。",constraints:["每条规则必须有可量化的 ifCond（如「正确率 < 70%」）","thenAct 必须是教师当场可做的动作","微评估时长 ≤ 3 min"]},sideEffect:"writePulseRules",writeback:{to:"artifactLibrary"}},{id:"feedback-language-templates",buttonLabel:"⬇ 生成反馈语模板（针对 5 类典型误区）",outputTitle:"课堂反馈语模板",outputCue:"把学情触发后的教师话术沉淀为模板。",artifactLines:{evidence:"教师即时反馈常陷入「点评对错」而非「指明下一步」。",action:"为 5 类典型误区（条文混淆 / 责任错配 / 立场偏移 / 数据缺失 / 角色塌缩）各写 2 句反馈模板。",constraints:["反馈必须指向证据而非观点","反馈必须给出下一步动作","避免「这个答案不对」类无信息反馈"]},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 任务链环节 未生成 学情校准点"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断"},E:{id:"artifactDone",desc:"已生成学情触发规则表 · 学情触发闭环完成"}},lintRules:[{id:"L1-rule-missing",when:"Store.getAllPulseRules() does not cover all anchors",severity:"block",onTriggerUI:"选项 none 触发 blockSave + 红色禁条框"}],horizontalLayerHooks:{L1:{visible:!0,role:"rule-editor",readsFromStation:7,writesTo:"Store.pulseRules",hardConstraint:"每个 学情校准点必须有「如果 X 则 Y」规则"},L2:{visible:!1,reason:"L2 在 4/6/8/11，课中调控环节 不直接处理议程"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[9]"},artifactLibrary:{path:"artifactLibrary"},pulseRules:{path:"pulseRules",readers:[11]},qualityCheckpoints:{backendMappingTo20Steps:["课堂检查点","即时反馈","学习预警","教学调控","ZPD 重新校准"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[9]=v(N)}(window),function(h){"use strict";const N={id:10,version:"phase11-v3",parentStageId:"S7",subNodeKey:"10",supportsRubricRevision:{to:"S2",storeKey:"rubricRevisions"},exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:4,label:"学习目标",key:"学习目标 + 评价证据",snippet:"30 分钟内输出带证据 / 带权重 / 带 TOWS 的 SWOT"},{stationId:8,label:"探究协作",key:"学生作品 + 4 角色产出",snippet:"5 组 SWOT-TOWS · 含议程角色映射 5/5"},{stationId:9,label:"形成性评价",key:"课堂学情触发记录",snippet:"3 个 ZPD 锚点规则 · Z1 触发 1 次 · Z2 触发 0 次 · Z3 触发 1 次"}],outputsTo:[{stationId:11,label:"教学反思",outKey:"量规评分 + 低分维度 → 复盘报告"}]},narrative:{what:"用 5 维量规判断学生作品是否真正体现 SWOT 判断能力，并生成可行动反馈语。",why:"学生作品可能格式完整但质量较低，例如缺少证据、分类错误、策略与分析不匹配或缺少风险边界。",how:"查看量规雷达图 + 低分维度 Pareto 图，判断作品主要问题，生成评价量规与反馈语模板。"},evidenceFigure:{title:"5 维量规雷达 + 低分维度 Pareto",subtitle:"看学生作品在哪一维塌缩",evidenceNote:"评分不能只看矩阵完整，还要看证据和策略质量。",bars:[["条目证据性",46,{status:"miss",source:"5 组中 4 组条目缺出处"}],["内外分类准确性",78,{status:"ok",source:"仅 1 组把集采放入 W"}],["条目精炼度",62,{status:"warn",source:"2 组列了 >10 条流水账"}],["TOWS 可操作性",44,{status:"miss",source:"3 组停在 SWOT 未做 TOWS"}],["批判意识",38,{status:"miss",source:"无组主动指出 SWOT 工具局限"}]],paretoLowDimensions:[{dim:"批判意识",mean:38,weightInTotal:.28},{dim:"TOWS 可操作性",mean:44,weightInTotal:.24},{dim:"条目证据性",mean:46,weightInTotal:.22}],rubric:[{dim:"条目证据性",levels:["4 优秀 = 每条 SWOT 引用具体出处（如「华海 2024 年报 P.18 研发投入 5.43 亿元」、「国办发〔2018〕20 号文件第 4 条」）；可被他人复核","3 合格 = 多数条目有出处但精度不足（如仅写「年报数据」、「医保局文件」未指明页码或文号）","2 不合格 = 多为形容词（如「研发能力强」「政策支持好」），缺可验证数据；评分者无法判断真伪"]},{dim:"内外分类准确性",levels:["4 优秀 = 全部象限分类正确（如集采降价归入 T 而非 W；MAH 政策归入 O 而非 S）","3 合格 = 偶有错位（1-2 条放错象限），能在追问下自我修正","2 不合格 = 多处错位（≥3 条），如把外部政策威胁塞入 W 维或把内部劣势塞入 T 维"]},{dim:"条目精炼度",levels:["4 优秀 = ≤6 条抓主要矛盾，每条 1 句话，按重要度排序","3 合格 = 7-10 条条目，存在并列但仍能识别主次","2 不合格 = >10 条流水账，无权重无排序，评分者无法识别核心结论"]},{dim:"TOWS 可操作性",levels:["4 优秀 = TOWS 含可量化 KPI（如「SO 战略：2025 年原料药出口额提升 15%」、「ST 战略：CDMO 业务占比从 8% 提升到 20%」）","3 合格 = TOWS 有方向但不具体（如「加大研发投入」「拓展海外市场」），缺时间表与指标","2 不合格 = 仅口号（如「积极应对集采」「抓住机遇」），未形成可执行战略；或完全跳过 TOWS"]},{dim:"批判意识",levels:["4 优秀 = 主动指出 SWOT 工具局限（如「SWOT 是快照不含时间维度，不适合 5 年长期战略」、「内外边界因企业边界变化而模糊」）","3 合格 = 教师追问后能答出 1-2 条局限","2 不合格 = 完全无批判，把 SWOT 当作客观真理使用"]}],flow:["看雷达","排 Pareto","写反馈"]},decision:{question:"表现性评价最应强调什么？",options:[{key:"evidence-first",label:"条目证据性（5 组中 4 组最低分维度）",rationale:"Pareto 排序第 3，但是最可教、最可短期改善的维度。建议第 1 优先级。",score:3.9,meta:{recommended:!0}},{key:"tows-action",label:"TOWS 可操作性（半数小组停在 SWOT）",rationale:"命中 SWOT 课的标志性失分区。但需要 30 分钟时间预算，本节课已不够。",score:3.4},{key:"format",label:"主要看矩阵格式是否完整",rationale:"形式完整不代表思维质量。会让评价退化为「四象限填满即满分」。",score:1.9,meta:{lintTriggers:["format-only-grading"]}},{key:"impression",label:"按小组展示印象给分",rationale:"主观性过强，证据不足，无法支撑下一轮迭代。",score:1.6,meta:{lintTriggers:["forbidden-impression-grading"]}}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{"evidence-first":{summary:"✓ Pareto 优先级合理",riskBadges:["高 ROI"],detail:"证据性是基础维度。先抓这一维，TOWS 与批判意识在下一轮再补。"},"tows-action":{summary:"△ 时间预算不够",riskBadges:["延后处理"],detail:"TOWS 训练需要 30 分钟独立时段，建议放下一节专题。"},format:{summary:"✕ 评价退化风险",riskBadges:["退化"],detail:"format-only 评价会让学生形成「填满 = 完成」的误解。"},impression:{summary:"✕ 主观偏差",riskBadges:["不可解释"],detail:"印象分无法支撑下一轮迭代，违反 contract 评价证据可解释性约束。"}},artifacts:[{id:"rubric-5d",buttonLabel:"⬇ 生成 5 维 SWOT 评价量规",outputTitle:"5 维表现性评价量规",outputCue:"把评价重心从格式完整转向判断质量。",artifactLines:{evidence:"5 维平均分：条目证据性 46 / 内外分类 78 / 精炼度 62 / TOWS 44 / 批判意识 38。",action:"用 5 维量规逐项评分；条目证据性与 TOWS 进入二次修改要求。",constraints:["评分依据必须可解释","反馈必须指向下一步修改","评价不能只看表格是否填满"]},writeback:{to:"artifactLibrary"}},{id:"feedback-language",buttonLabel:"⬇ 生成 5 类典型问题的反馈语模板",outputTitle:"反馈语模板（针对 5 类低分作品）",outputCue:"把评价转化为可被学生改进的具体话术。",artifactLines:{evidence:"5 类典型问题：① 形容词条目 ② 政策错位 ③ 流水账 ④ 只做 SWOT 不做 TOWS ⑤ 缺批判意识。",action:"为每类问题写 2 句反馈语（含「需要做什么」+ 「为什么」）。",constraints:["反馈语必须可执行","反馈语必须给出修改样例","避免「不够好」「再深入」类无信息词"]},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 协作任务环节 学生作品未生成"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断"},E:{id:"artifactDone",desc:"已生成 5 维量规 + 反馈语 · 数据流入 S8 复盘与决策"}},lintRules:[{id:"format-only-grading",when:"decision.userChoice === 'format'",severity:"medium",onTriggerUI:"选项 format 显示「评价退化」徽章"},{id:"forbidden-impression-grading",when:"decision.userChoice === 'impression'",severity:"medium",onTriggerUI:"选项 impression 显示「不可解释」徽章"}],horizontalLayerHooks:{L1:{visible:!0,role:"trace-consumer",readsFromStore:"pulseRules"},L2:{visible:!1,reason:"L2 在 4/6/8/11"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[10]"},artifactLibrary:{path:"artifactLibrary"},qualityCheckpoints:{backendMappingTo20Steps:["学生作品","评价量规","评分说明","反馈语","二次修改"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[10]=v(N)}(window),function(h){"use strict";const N={id:11,version:"phase11-v3",isSplit:!0,parentStageId:["S8","S9"],subNodeKey:["11a","11b"],splitMap:{"11a":{stageId:"S8",subTitle:"教师复盘与改进决策",artifactIds:["review-report"]},"11b":{stageId:"S9",subTitle:"资产沉淀与知识库更新",artifactIds:["next-round-plan"]}},exampleCase:{topic:"SWOT",subject:"华海药业",scenario:"集采常态化"},chainTopcard:{layerId:"L3",sticky:!0,minimizedHeight:32,inputsFrom:[{stationId:3,label:"议程协商",key:"议程列表 + 兑现轨迹",snippet:"5 条议程 · 跨站兑现链：案例与证据环节 → 协作任务环节 → S8 复盘与决策"},{stationId:9,label:"形成性评价",key:"学情触发规则 + 触发记录",snippet:"3 个 ZPD 锚点规则 + 课堂触发摘要"},{stationId:10,label:"表现性评价",key:"学生作品评分 + 低分维度",snippet:"5 维量规 · Pareto 低分维度"}],outputsTo:[]},narrative:{what:"把学生作品、典型误区、低分维度、反馈语、案例材料和改进建议沉淀为下一轮教学资产；强制完成学生议程兑现度回顾。",why:"复盘第 1 部分强制回顾学生议程的兑现度，关上 学习者议程贯通的闭环，避免议程被收集后束之高阁。",how:"查看议程兑现度回顾表（来自学习者议程）+ 资产沉淀优先级图，选择最值得保存的资产，生成教学复盘报告。"},evidenceFigure:{title:"议程兑现度回顾表 + 资产沉淀优先级",subtitle:"看议程是否真闭环 · 看哪些值得保存",evidenceNote:"复盘不是写感想，而是保存下一轮可复用的证据和材料。",bars:[["低分样例",76,{status:"ok",source:"学生 SWOT 错例 · 内外错位 6 例"}],["反馈语",68,{status:"ok",source:"5 类误区反馈模板"}],["修订案例",82,{status:"ok",source:"华海药业材料包 v2 · 补 W 维近期数据"}],["课堂气氛",28,{status:"miss",source:"不值得沉淀 · 不可复用"}]],agendaTraceColumns:["议程文本","案例与证据环节 证据","协作任务环节 角色","S8 复盘与决策回顾","本轮兑现度","未兑现原因（如有）"],agendaTraceFromStore:!0,agendaUnfulfillmentInputEnabled:!0,agendaUnfulfillmentNoteHint:"针对未兑现议程，记录原因（如「学生未在小组讨论中提及」、「证据材料不足」、「时间不够」），供下一轮迭代参考。",pulseTriggerSummaryColumns:["锚点","微评估格式","如果 X","则 Y"],pulseTriggerFromStore:!0,flow:["看议程链","看学情触发链","存资产"]},agendaEchoCard:{layerId:"L2",borderColor:"amber",source:"议程贯通闭环点 · 5 条议程的完整兑现轨迹",mode:"closure-review",hint:"本节点把议程从「学习者议程 提出」→「案例与证据环节 证据」→「协作任务环节 角色」→「S8 复盘与决策」整条链路总结。生成复盘报告时所有议程被标记为「已回顾」。",writeback:{toStation:11,toKey:"agendaFulfillment[11]",closesL2Loop:!0}},decision:{question:"复盘时最值得沉淀的资产是什么？",options:[{key:"asset-with-agenda",label:"沉淀低分样例 + 反馈语 + 修订案例 + 议程闭环回顾",rationale:"命中 议程贯通闭环约束。同时保留量规改进、案例 v2、议程兑现度三类资产。",score:3.9,meta:{recommended:!0,lintTriggers:["L2-closure-pending"],v3New:!0}},{key:"asset",label:"沉淀低分样例、反馈语和修订后的案例材料",rationale:"能直接服务下一轮教学优化，但缺议程闭环回顾会让 议程贯通断尾。",score:3.2},{key:"plan",label:"只保存最终教案",rationale:"缺少学生证据和迭代依据。",score:2.1},{key:"mood",label:"只记录课堂气氛是否活跃",rationale:"不能形成可验证改进。",score:1.6}],validation:{mustSelect:!0,afterSelectShow:["rationale","riskBadges"]}},feedbackByKey:{"asset-with-agenda":{summary:"✓ 完成 议程贯通闭环",riskBadges:["议程闭环","高优先级"],detail:"选择此项后，生成复盘报告时 5 条议程会被标记为「已回顾」。整条议程贯通从学习者议程走到 S8 复盘与决策，真正闭合。",nextStationHint:"本节课已无下游。资产将进入教学资产库，供下一轮调用。"},asset:{summary:"△ 资产沉淀完整但议程未闭环",riskBadges:["议程断尾"],detail:"建议改选 A，让 5 条议程获得完整兑现轨迹。"},plan:{summary:"✕ 资产价值最低",riskBadges:["不可迭代"],detail:"最终教案缺少学生证据，无法支撑下一轮迭代。"},mood:{summary:"✕ 不可验证",riskBadges:["伪复盘"],detail:"课堂气氛是结果而非原因，不能形成可验证改进。"}},artifacts:[{id:"review-report",buttonLabel:"⬇ 生成教学复盘报告（含议程兑现度回顾）",outputTitle:"教学复盘报告 v1",outputCue:"把本次教学的议程链、学情触发链、评价链合成一份可迭代的复盘报告。",artifactLines:{evidence:"议程链：案例与证据环节 兑现 5/5 · 协作任务环节 角色匹配 5/5。学情触发链：3 个 ZPD 锚点规则齐备。评价链：低分维度集中在「条目证据性」与「TOWS 可操作性」。",action:"把以上三链汇总，生成《教学复盘报告 v1》，并把 5 条议程标记为「已回顾」。",constraints:["复盘报告必须含议程兑现轨迹表","必须含学情触发规则与触发摘要","必须含下一轮改进的可执行清单"]},templateSections:[{id:"context",title:"1. 课堂概况",placeholder:"本节课时长、班级、议程关键字、关键节点（如「微实战段超时 3 min」「Z2 触发 1 次」）。",requiredFields:["classDuration","agendaCount","criticalMoments"]},{id:"agenda-fulfillment",title:"2. 议程兑现度",placeholder:"5 条议程的跨站兑现轨迹（S2 → S4 → S5 → S8 全链路）；未兑现议程及原因。",requiredFields:["fulfilledCount","unfulfilledList","unfulfilledReasons"]},{id:"pulse-triggers",title:"3. 学情触发摘要",placeholder:"3 个 ZPD 锚点的实际触发情况：触发率、教师响应动作、后续调整。",requiredFields:["z1Triggered","z2Triggered","z3Triggered","teacherActions"]},{id:"low-dimensions",title:"4. 低分维度诊断",placeholder:"5 维量规中得分最低的 2-3 个维度；学生作品中最典型的错例；可能的根因。",requiredFields:["lowDimList","errorExamples","rootCauseHypothesis"]},{id:"next-improvement",title:"5. 下一轮第一改进项",placeholder:"本次复盘最值得在下一轮优先改进的 1 项动作（具体到环节、时间、动作）。",requiredFields:["targetStage","targetActivity","successCriterion"]}],sideEffect:"closeL2Loop",writeback:{to:"artifactLibrary"}},{id:"next-round-plan",buttonLabel:"⬇ 生成下一轮改进计划（3 条优先项）",outputTitle:"下一轮改进优先级清单",outputCue:"把本轮低分维度转化为下一轮的设计动作。",artifactLines:{evidence:"本轮低分集中在：① 学生 SWOT 条目证据性 ② TOWS 策略可操作性 ③ Z2 推演分歧反馈过快。",action:"下一轮在任务链环节 加 1 个「证据出处强制校验」锚点；案例与证据环节 案例 v2 补 2024 年后 W 维数据；课中调控环节 Z2 阈值由 15% 调到 20%。",constraints:["改进项必须落到具体节点","每项必须有可观察的成功指标","≤ 3 项 · 不超过下一轮可处理的认知预算"]},regulationLog:{required:!0,schema:[{field:"regulationName",label:"法规名称",example:"《药品管理法》"},{field:"version",label:"版本号 / 发布日期",example:"2019 年修订 / 2019-08-26"},{field:"citedClauses",label:"本课引用条款",example:"第 30 条（持有人义务）/ 第 100 条（仿制药一致性评价）"},{field:"lastChecked",label:"本次复盘核查日期",example:"2026-05-29"},{field:"updateNeeded",label:"是否需要更新",example:"否 / 是（备注：新政策待并入）"},{field:"nextReviewDate",label:"下一次复核计划",example:"2026-11-29（每 6 个月）"}],note:"建议每次资产沉淀时核对本课所引法规是否仍为最新版本；若有更新，本课案例与证据包需同步修订。"},writeback:{to:"artifactLibrary"}}],stateMachine:{A:{id:"locked",desc:"未进入 · 评价与画像环节 未生成评分"},B:{id:"entered",desc:"已进入未判断"},C:{id:"selected",desc:"已选未保存"},D:{id:"saved",desc:"已保存判断"},E:{id:"artifactDone",desc:"已生成复盘报告 · 议程贯通闭环完成 · 整节课归档"}},lintRules:[{id:"L2-closure-pending",when:"agendaFulfillment[11] is empty AND agendas.length > 0",severity:"high",onTriggerUI:"在选项 asset-with-agenda 上加「推荐 · 议程闭环」pill"}],horizontalLayerHooks:{L1:{visible:!0,role:"trace-summary",readsFromStore:"pulseRules"},L2:{visible:!0,role:"closure-point",echoMode:"closure-review",readsFromStore:"agendaFulfillment"},L3:{visible:!0,sticky:!0,minimizedHeight:32}},persistence:{userJudgments:{path:"userJudgments[11]"},artifactLibrary:{path:"artifactLibrary"},agendaFulfillment:{path:"station3.agendaFulfillment[11]",closesL2Loop:!0},qualityCheckpoints:{backendMappingTo20Steps:["数据复盘","教学反思","资源沉淀","下一轮改进","议程兑现度回顾"]}}};function v(l){return Object.freeze(l),Object.getOwnPropertyNames(l).forEach(w=>{const u=l[w];u&&typeof u=="object"&&!Object.isFrozen(u)&&v(u)}),l}h.PharmacoPilotStationPayloads||(h.PharmacoPilotStationPayloads={}),h.PharmacoPilotStationPayloads[11]=v(N)}(window),function(h){"use strict";const B="pharmacoPilot.state.v1";function v(){return{version:"v1",activeStation:5,judgments:{},artifacts:{},agendas:[],agendaFulfillment:{},agendaUnfulfillmentNotes:{},zpdAnchors:[],pulseRules:{},rubricRevisions:[],observationLog:{},transferLog:{},consentSampleCollection:{enabled:!1,consentedAt:null},chainProgress:{}}}let l=v();try{const b=h.localStorage&&localStorage.getItem(B);if(b){const i=JSON.parse(b);i&&typeof i=="object"&&i.version===v().version?l=Object.assign(v(),i):i&&console.warn("[store] state version mismatch, discarding persisted state:",i.version)}}catch(b){console.warn("[store] load failed, using default",b)}function w(){try{localStorage.setItem(B,JSON.stringify(l))}catch(b){console.warn("[store] persist failed",b)}}const u=new Map;function F(b,i){return u.has(b)||u.set(b,new Set),u.get(b).add(i),()=>u.get(b)&&u.get(b).delete(i)}function I(b,i){const m=u.get(b);m&&m.forEach($=>{try{$(i)}catch(C){console.warn("[store] listener error",b,C)}});const T=u.get("*");T&&T.forEach($=>{try{$({event:b,payload:i})}catch(C){console.warn(C)}})}function A(b,i,m,T,$){const C=$!=null?String($):b;l.judgments[C]={stationId:b,subKey:$!=null?String($):null,key:i,score:m,label:T,savedAt:Date.now()},$==null&&typeof b=="number"&&b>=l.activeStation&&b<11&&(l.activeStation=b+1),w(),I("judgment:saved",{stationId:b,subKey:$!=null?String($):null,key:i,score:m,label:T}),I("progress:changed",H())}function q(b){return l.judgments[b]||null}function M(b,i,m){l.artifacts[b]||(l.artifacts[b]=[]),l.artifacts[b].push({artifactId:i,data:m,savedAt:Date.now()}),w(),I("artifact:saved",{stationId:b,artifactId:i})}function _(b){return l.artifacts[b]||[]}function D(b){l.agendas=Array.isArray(b)?b.slice():[],w(),I("agenda:listChanged",l.agendas)}function W(){return l.agendas.slice()}function R(b,i,m){l.agendaFulfillment[b]||(l.agendaFulfillment[b]={}),l.agendaFulfillment[b][i]={evidence:m,at:Date.now()},w(),I("agenda:fulfilled",{stationId:b,agendaKey:i,evidence:m})}function J(b){return Object.assign({},l.agendaFulfillment[b]||{})}function X(b){const i=l.agendaFulfillment[b]||{};return l.agendas.filter(m=>!i[m.key])}function ce(b,i){return!b||!i?{ok:!1,error:"agendaKey 与 reason 必填"}:(l.agendaUnfulfillmentNotes[b]={reason:String(i).trim(),notedAt:Date.now()},w(),I("agenda:unfulfillmentNoted",{agendaKey:b,reason:i}),{ok:!0})}function ve(){return Object.assign({},l.agendaUnfulfillmentNotes||{})}function H(){return{done:Object.keys(l.judgments).length,total:11,active:l.activeStation}}function ge(b){l.activeStation=b,w(),I("active:changed",{id:b})}function pe(){return l.activeStation}function ue(){l=v(),w(),I("store:reset",{}),I("progress:changed",H())}function n(b){l.zpdAnchors=(Array.isArray(b)?b:[]).map(i=>({id:i.id,t:i.t,label:i.label,definedAt:Date.now()})),w(),I("zpd:anchorsChanged",l.zpdAnchors.slice())}function xe(){return l.zpdAnchors.slice()}function U(b,i){l.pulseRules[b]=Object.assign({},i,{savedAt:Date.now()}),w(),I("pulse:ruleSaved",{anchorId:b,rule:l.pulseRules[b]})}function V(b){return l.pulseRules[b]||null}function re(){return Object.assign({},l.pulseRules)}function de({dim:b,reason:i,proposedChange:m,evidenceArtifactId:T}){if(!b||!i)return{ok:!1,error:"dim 和 reason 必填"};const $={id:"rr-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),dim:b,reason:i,proposedChange:m||"",evidenceArtifactId:T||null,status:"pending",proposedAt:Date.now()};return l.rubricRevisions.push($),w(),I("rubric:revisionProposed",$),{ok:!0,revision:$}}function Le(b,i,m){const T=l.rubricRevisions.find($=>$.id===b);return T?i!=="accepted"&&i!=="rejected"?{ok:!1,error:"decision 须为 accepted | rejected"}:(T.status=i,T.resolvedAt=Date.now(),m&&(T.resolutionNote=m),w(),I("rubric:revisionResolved",T),{ok:!0,revision:T}):{ok:!1,error:"not found"}}function _e(b){return b?l.rubricRevisions.filter(i=>i.status===b):l.rubricRevisions.slice()}function Be(){return Object.assign({enabled:!1,consentedAt:null},l.consentSampleCollection||{})}function he(b){l.consentSampleCollection={enabled:!!b,consentedAt:b?new Date().toISOString():null},w(),I("consent:changed",l.consentSampleCollection)}function Ae(b,i,m){l.observationLog[b]||(l.observationLog[b]={}),l.observationLog[b][i]||(l.observationLog[b][i]=[]),l.observationLog[b][i].push(Object.assign({ts:Date.now()},m||{})),w(),I("observation:logged",{stationId:b,step:i,payload:m})}function Oe(b,i){const m=l.observationLog[b]||{};return i==null?Object.assign({},m):(m[i]||[]).slice()}function je(b,i,m){if(!i||typeof i!="string")return{ok:!1,error:"text required"};l.transferLog[b]||(l.transferLog[b]=[]);const T={ts:Date.now(),text:i.trim(),axis:m||null};return l.transferLog[b].push(T),w(),I("transfer:saved",{stationId:b,entry:T}),{ok:!0,entry:T}}function De(b){return(l.transferLog[b]||[]).slice()}function be(b){return b?(delete l.chainProgress[b],delete l.transferLog[b],delete l.observationLog[b],delete l.judgments[b],delete l.judgments[String(b)],Object.keys(l.judgments).forEach(i=>{const m=l.judgments[i];m&&m.stationId===b&&delete l.judgments[i]}),w(),I("chain:reset",{stationId:b}),I("progress:changed",H()),{ok:!0}):{ok:!1,error:"stationId required"}}function ze(b){l.transferLog[b]||(l.transferLog[b]=[]);const i={ts:Date.now(),skipped:!0,text:"",axis:null};return l.transferLog[b].push(i),w(),I("transfer:saved",{stationId:b,entry:i,skipped:!0}),{ok:!0,entry:i}}function ke(){return JSON.parse(JSON.stringify(l.transferLog||{}))}function Ke(b,i,m){l.chainProgress[b]||(l.chainProgress[b]={currentStep:1,reflections:{}});const T=l.chainProgress[b];T.currentStep=Math.max(T.currentStep||1,i),Object.assign(T,m||{}),w(),I("chain:stepChanged",{stationId:b,step:i,fields:m})}function We(b){return Object.assign({currentStep:1,reflections:{}},l.chainProgress[b]||{})}function Ee(b,i,m){l.chainProgress[b]||(l.chainProgress[b]={currentStep:1,reflections:{}}),l.chainProgress[b].reflections[i]={text:String(m||"").trim(),ts:Date.now()},w(),I("chain:reflectionSaved",{stationId:b,field:i,text:m})}function Te(){return JSON.parse(JSON.stringify(l))}function qe(b){return!b||typeof b!="object"?{ok:!1,error:"invalid payload"}:(b.version&&b.version!==l.version&&console.warn("[store] importing different version",b.version,"→",l.version),l=Object.assign(v(),b),w(),I("store:imported",{judgments:Object.keys(l.judgments).length}),I("progress:changed",H()),{ok:!0})}h.PharmacoPilotStore={on:F,emit:I,saveJudgment:A,getJudgment:q,saveArtifact:M,getArtifacts:_,setAgendas:D,getAgendas:W,markAgendaFulfilled:R,getAgendaFulfillment:J,getUncoveredAgendas:X,saveAgendaUnfulfillmentNote:ce,getAgendaUnfulfillmentNotes:ve,setZpdAnchors:n,getZpdAnchors:xe,setPulseRule:U,getPulseRule:V,getAllPulseRules:re,proposeRubricRevision:de,resolveRubricRevision:Le,getRubricRevisions:_e,getConsent:Be,setConsent:he,logObservation:Ae,getObservations:Oe,saveTransfer:je,skipTransfer:ze,getTransfer:De,getAllTransfers:ke,resetChainProgress:be,setChainStep:Ke,getChainProgress:We,saveChainReflection:Ee,getProgress:H,setActiveStation:ge,getActiveStation:pe,reset:ue,dump:Te,importState:qe}}(window),function(h){"use strict";function B(N){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",N):N()}B(function(){const v=h.PharmacoPilotStore;if(!v){console.warn("[sample-collection] Store missing");return}const l={stepCtx:new Map};function w(R,J){return`${R}:${J}`}function u(){try{return!!v.getConsent().enabled}catch{return!1}}function F(R,J){const X=w(R,J);l.stepCtx.set(X,{enteredAt:Date.now(),hintsUsed:0,firstChoice:null}),v.logObservation(R,J,{event:"entered",shared:u()})}function I(R,J,X){const ce=w(R,J),ve=l.stepCtx.get(ce);ve&&(ve.hintsUsed=Math.max(ve.hintsUsed,X)),v.logObservation(R,J,{event:"hintRevealed",hintLevel:X,shared:u()})}function A(R,J,X,ce){const ve=w(R,J),H=l.stepCtx.get(ve)||{enteredAt:Date.now(),hintsUsed:0,firstChoice:null};H.firstChoice==null&&(H.firstChoice=X),l.stepCtx.set(ve,H);const ge=Date.now()-H.enteredAt;v.logObservation(R,J,{event:"chose",choiceKey:X,firstChoice:H.firstChoice,hintsUsed:H.hintsUsed,dwellMs:ge,isCorrect:!!ce,shared:u()})}function q(R,J,X){const ce=v.saveTransfer(R,J,X);return v.logObservation(R,4,{event:"transferSubmitted",textLen:(J||"").length,axis:X,shared:u()}),ce}function M(R,J,X){v.logObservation(R,J,{event:"selfReport",comment:String(X||"").slice(0,200),shared:u()})}let _=!1;function D(R){if(u()||_||document.getElementById("ppl-consent-card"))return;const J=document.createElement("div");J.id="ppl-consent-card",J.className="consent-card",J.innerHTML=`
        <div class="consent-head">
          <span class="consent-tag">○ 样本贡献邀请</span>
          <button class="consent-close" aria-label="关闭">×</button>
        </div>
        <div class="consent-body">
          <p class="consent-lead">你的判断很有价值</p>
          <p class="consent-text">
            愿意把你在 9 个教学环节里的判断匿名贡献到样本库吗?
            这会帮助系统识别新教师的常见思维盲点,让后续教师少走弯路。
          </p>
          <p class="consent-note">数据仅本地保存,可随时在设置里关闭。</p>
        </div>
        <div class="consent-actions">
          <button class="btn-s consent-accept">启用并继续</button>
          <button class="btn-s consent-decline">暂不启用</button>
        </div>
      `,document.body.appendChild(J);function X(){J.classList.add("is-leaving"),setTimeout(()=>{try{J.remove()}catch{}},220)}J.querySelector(".consent-accept").addEventListener("click",()=>{v.setConsent(!0),X(),R&&typeof R.onAccept=="function"&&R.onAccept()}),J.querySelector(".consent-decline").addEventListener("click",()=>{_=!0,X(),R&&typeof R.onDecline=="function"&&R.onDecline()}),J.querySelector(".consent-close").addEventListener("click",()=>{_=!0,X()})}function W(){return{consent:v.getConsent(),observations:v.dump().observationLog||{},transfers:v.getAllTransfers()}}h.PharmacoPilotSampleCollection={isEnabled:u,trackStepEntered:F,trackHintRevealed:I,trackChoice:A,trackTransferSubmit:q,trackSelfReport:M,showConsentCard:D,dumpSamples:W}})}(window),function(){"use strict";function Y(h){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",h):h()}Y(function(){const B=window.PharmacoPilotNavigationContract,N=window.PharmacoPilotDecisionBank;if(!B||!N){console.warn("[nav-render] contract or decision bank not loaded");return}const v=B.NAV_STATIONS||[],l=Object.fromEntries(v.map(e=>[e.id,e])),w=B.NAV_STAGES||[],u=B.SUB_NODES||{},F=B.STAGE_CHAIN||{},I=Object.fromEntries(w.map(e=>[e.id,e])),A=w.length;function q(e){const t=u[String(e)];return t?t.stageId:null}function M(e){if(e===11)return"S8";const t=u[String(e)];return t?t.stageId:null}function _(){if(pe)return pe;const e=M(H),t=e?I[e]:null;return!t||!Array.isArray(t.subNodeIds)?null:t.subNodeIds.map(String).find(s=>{const r=u[s]||{};return(typeof r.legacyStationId=="number"?r.legacyStationId:Number(s))===H})||null}function D(e){const t=window.PharmacoPilotStationPayloads||{},a=typeof e=="object"?e.id:e;return t[a]||null}function W(e){const t=D(e);return t&&t.evidenceFigure||null}(function(){if(document.getElementById("ppl-v3-figure-styles"))return;const t=document.createElement("style");t.id="ppl-v3-figure-styles",t.textContent=`
        /* ---- 03 议程聚类 ---- */
        .agenda-cluster-wrap { padding: 6px 0 4px; }
        .agcl-row {
          display: grid; grid-template-columns: 26px 1fr 3fr auto;
          align-items: center; gap: 10px; padding: 5px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .agcl-rank { font-family: var(--mono); color: var(--mute, #999); font-size: var(--fs-2xs); }
        .agcl-lbl  { color: var(--ink, #1a1714); }
        .agcl-bar  { display: block; height: 8px; border-radius: 4px;
                     background: rgba(168,73,42,0.08); position: relative; overflow: hidden; }
        .agcl-bar i { display: block; height: 100%; border-radius: 4px; transition: width .35s ease; }
        .agcl-val  { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute, #999); white-space: nowrap; }

        /* ---- 06 证据密度 + 议程对照 ---- */
        .evdensity-wrap { padding: 6px 0 4px; }
        .evdensity-bars { display: flex; flex-direction: column; gap: 6px; }
        .evd-row {
          display: grid; grid-template-columns: 80px 1fr 90px;
          align-items: center; gap: 10px;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .evd-lbl { color: var(--ink, #1a1714); }
        .evd-track {
          display: block; height: 10px; border-radius: 5px;
          background: rgba(168,73,42,0.08); overflow: hidden;
        }
        .evd-track i { display: block; height: 100%; border-radius: 5px; transition: width .35s ease; }
        .evd-val { font-family: var(--mono); font-size: var(--fs-2xs); text-align: right; }
        .evd-agendas { margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(168,73,42,0.18); }
        .evd-agendas-hd {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute, #999); letter-spacing: 0.08em; margin-bottom: 6px;
        }
        .evd-agendas-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .evd-agenda {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 12px; font-size: var(--fs-2xs);
          font-family: var(--serif-cn);
          background: #faf6ee; color: var(--ink, #1a1714);
          border: 1px solid rgba(168,73,42,0.15);
        }
        .evd-agenda i { width: 6px; height: 6px; border-radius: 50%; background: #d88a3a; }
        .evd-agenda.is-covered i { background: var(--sage, #6a9a7b); }
        .evd-agenda.is-miss { color: var(--amber-deep, #a8492a); border-color: rgba(168,73,42,0.4); }
        .evd-agenda.is-miss i { background: var(--amber-deep, #a8492a); }
        .evd-callout {
          margin-top: 12px; padding: 8px 10px;
          background: #faf6ee; border-left: 3px solid var(--amber-deep, #a8492a);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink, #1a1714);
        }
        .evd-callout b { color: var(--amber-deep, #a8492a); margin-right: 4px; }
        /* === 05 方法论严谨链 chain-row === */
        .chain-rows { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }
        .chain-row {
          display: grid; grid-template-columns: 36px 44px 1fr auto;
          align-items: center; gap: 8px;
          padding: 7px 8px; border-radius: 6px;
          background: rgba(168,73,42,0.04);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .chain-row .cr-lvl {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 22px; border-radius: 4px;
          color: #fff; font-family: var(--mono); font-size: var(--fs-2xs);
          font-weight: 600;
        }
        .chain-row .cr-type {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--ink, #1a1714); letter-spacing: 0.04em;
        }
        .chain-row .cr-text { color: var(--ink, #1a1714); line-height: 1.4; }
        .chain-row .cr-meta { display: flex; gap: 6px; align-items: center; font-family: var(--mono); font-size: var(--fs-2xs); }
        .chain-row .cr-diff { font-weight: 600; }
        .chain-row .cr-block { color: var(--amber-deep, #a8492a); font-weight: 500; }
        /* === M · station 11 S8 复盘视图 === */
        .s8-view .ar-section { padding: 8px 0; }
        .s8-view .ar-section + .ar-section {
          border-top: 1px dashed rgba(168,73,42,0.18); margin-top: 8px; padding-top: 12px;
        }
        .s8-view .ar-head {
          display: flex; justify-content: space-between; align-items: baseline;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute, #999); letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
        .s8-view .ar-head .ar-legend { color: var(--amber-deep, #a8492a); }
        .s8-view .ar-list { display: flex; flex-direction: column; gap: 4px; }
        .s8-view .ar-row {
          display: grid; grid-template-columns: 1fr auto auto; gap: 12px;
          align-items: center; padding: 5px 8px; border-radius: 5px;
          background: rgba(168,73,42,.04);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .s8-view .ar-row .ar-text { color: var(--ink, #1a1714); }
        .s8-view .ar-row .ar-cells {
          display: inline-flex; gap: 3px;
          font-family: var(--mono); font-size: var(--fs-2xs);
        }
        .s8-view .ar-row .ar-cell {
          width: 14px; text-align: center; display: inline-block;
        }
        .s8-view .ar-row .ar-cell.ar-yes { color: var(--sage, #6a9a7b); font-weight: 600; }
        .s8-view .ar-row .ar-cell.ar-no { color: rgba(0,0,0,.18); }
        .s8-view .ar-row .ar-score {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep, #a8492a); font-weight: 600;
          min-width: 28px; text-align: right;
        }
        .s8-view .ar-empty {
          padding: 14px; text-align: center;
          color: var(--mute, #999); font-size: var(--fs-2xs);
          background: rgba(168,73,42,.03); border-radius: 6px;
        }
        .s8-view .pr-row {
          display: grid; grid-template-columns: 40px 38px 1fr; gap: 8px;
          align-items: center; padding: 5px 8px; border-radius: 5px;
          background: rgba(168,73,42,.04);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          margin-bottom: 3px;
        }
        .s8-view .pr-row .pr-id {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        .s8-view .pr-row .pr-t {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute, #999);
        }
        .s8-view .pr-row .pr-rule { color: var(--ink, #1a1714); font-size: var(--fs-2xs); }
        .s8-view .pr-row .pr-empty { color: var(--mute, #999); font-style: italic; }
        /* === M · station 11 S9 资产视图 (extra) === */
        .s9-view .evd-source {
          display: block; font-family: var(--mono);
          font-size: var(--fs-2xs); color: var(--mute, #999); margin-top: 1px;
          letter-spacing: 0.02em;
        }

        /* ====== O · DARK MODE 覆盖 · 数据驱动图表组件 ====== */
        html[data-theme="dark"] .agcl-lbl { color: var(--ivory); }
        html[data-theme="dark"] .agcl-val { color: var(--mute-2); }
        html[data-theme="dark"] .agcl-bar { background: rgba(255,253,247,.06); }
        html[data-theme="dark"] .agcl-rank { color: var(--mute-2); }

        html[data-theme="dark"] .evd-lbl { color: var(--ivory); }
        html[data-theme="dark"] .evd-track { background: rgba(255,253,247,.06); }
        html[data-theme="dark"] .evd-agendas { border-top-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .evd-agendas-hd { color: var(--mute-2); }
        html[data-theme="dark"] .evd-agenda {
          background: rgba(255,253,247,.04); color: var(--on-dark);
          border-color: rgba(255,253,247,.10);
        }
        html[data-theme="dark"] .evd-agenda.is-miss {
          background: rgba(217,119,87,.12); color: var(--amber-soft); border-color: rgba(217,119,87,.35);
        }
        html[data-theme="dark"] .evd-callout {
          background: rgba(217,119,87,.10); color: var(--on-dark); border-left-color: var(--amber);
        }
        html[data-theme="dark"] .evd-callout b { color: var(--amber-soft); }

        html[data-theme="dark"] .chain-row {
          background: rgba(255,253,247,.04);
        }
        html[data-theme="dark"] .chain-row .cr-type { color: var(--on-dark-mute); }
        html[data-theme="dark"] .chain-row .cr-text { color: var(--ivory); }
        html[data-theme="dark"] .chain-row .cr-block { color: var(--amber-soft); }

        html[data-theme="dark"] .s8-view .ar-row {
          background: rgba(255,253,247,.04); color: var(--on-dark);
        }
        html[data-theme="dark"] .s8-view .ar-row .ar-text { color: var(--ivory); }
        html[data-theme="dark"] .s8-view .ar-row .ar-cell.ar-no { color: rgba(255,253,247,.18); }
        html[data-theme="dark"] .s8-view .ar-row .ar-score { color: var(--amber-soft); }
        html[data-theme="dark"] .s8-view .ar-empty {
          background: rgba(255,253,247,.04); color: var(--mute-2);
        }
        html[data-theme="dark"] .s8-view .pr-row {
          background: rgba(255,253,247,.04);
        }
        html[data-theme="dark"] .s8-view .pr-row .pr-rule { color: var(--on-dark); }
        html[data-theme="dark"] .s8-view .pr-row .pr-empty { color: var(--mute-2); }
      `,document.head.appendChild(t)})(),function(){if(document.getElementById("ppl-decision-v4-styles"))return;const t=document.createElement("style");t.id="ppl-decision-v4-styles",t.textContent=`
        /* qchain-rich: 每个选项展开成 head + rationale 两行 */
        .qchain.qchain-rich li { padding: 10px 0 10px 32px; cursor: pointer; transition: background .12s; }
        .qchain.qchain-rich li:hover { background: rgba(217,119,87,0.04); }
        .qchain.qchain-rich li.is-selected { background: var(--amber-wash, #f7e6d8); }
        .qchain.qchain-rich .qopt-head {
          display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.5;
        }
        .qchain.qchain-rich .qopt-label { font-weight: 500; }
        .qchain.qchain-rich .qopt-score {
          margin-left: auto; font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.02em;
        }
        .qchain.qchain-rich .qopt-score b { color: var(--ink-2); font-weight: 600; }
        .qchain.qchain-rich .qopt-rationale {
          margin-top: 5px; font-family: var(--serif-cn); font-size: var(--fs-xs);
          line-height: 1.55; color: var(--ink-soft);
        }
        /* ann 三档变体（保留 .ann.fork 作为 .ann-rec 的别名） */
        .ann.ann-alt { background: var(--paper-3, #ece5d3); color: var(--ink-2); }
        .ann.ann-avoid {
          background: transparent; color: var(--mute);
          border: 1px solid var(--rule-2, rgba(27,25,22,.18));
        }
        .ann.ann-rec {
          background: var(--amber-wash, #f7e6d8); color: var(--amber-deep, #a8492a);
          border: 1px solid var(--amber-deep, #a8492a); font-weight: 600;
        }
        /* decision-dock 按钮三档 + 保存禁用 */
        .decision-dock .btn-s.dd-opt.is-selected {
          background: var(--amber-wash, #f7e6d8);
          border-color: var(--amber-deep, #a8492a);
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        .decision-dock .btn-s.is-avoid { color: var(--mute); border-style: dashed; }
        .decision-dock .btn-s.fill[disabled] {
          background: var(--paper-3, #ece5d3); color: var(--mute-2, #98938b);
          border-color: var(--rule, rgba(27,25,22,.10));
          cursor: not-allowed;
        }
        /* 产物区门禁：保存判断前置灰 */
        .ppl-artifact-zone.is-gated .ppl-artifact-gate {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--amber-deep);
          margin-bottom: 6px; letter-spacing: 0.04em;
        }
        .ppl-artifact-zone.is-gated button[data-artifact-id] {
          color: var(--mute-2); border-style: dashed; cursor: not-allowed; opacity: 0.65;
        }

        /* dark mode */
        html[data-theme="dark"] .qchain.qchain-rich li:hover { background: rgba(217,119,87,0.08); }
        html[data-theme="dark"] .qchain.qchain-rich li.is-selected { background: rgba(217,119,87,.18); }
        html[data-theme="dark"] .qchain.qchain-rich .qopt-rationale { color: var(--on-dark-mute); }
        html[data-theme="dark"] .qchain.qchain-rich .qopt-score b { color: var(--ivory); }
        html[data-theme="dark"] .ann.ann-alt { background: rgba(255,253,247,.06); color: var(--on-dark); }
        html[data-theme="dark"] .ann.ann-avoid { color: var(--mute-2); border-color: rgba(255,253,247,.18); }
        html[data-theme="dark"] .ann.ann-rec { background: rgba(217,119,87,.25); color: var(--amber-soft); border-color: var(--amber-soft); }
      `,document.head.appendChild(t)}(),function(){if(document.getElementById("ppl-chain-v5-styles"))return;const t=document.createElement("style");t.id="ppl-chain-v5-styles",t.textContent=`
        /* ── Stepper ── */
        .qchain-stepper {
          display: flex; align-items: center; gap: 4px;
          padding: 6px 0 12px; margin-bottom: 10px;
          border-bottom: 1px dashed var(--rule);
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.06em;
        }
        .qchain-stepper .qstep {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 12px;
          color: var(--mute-2, #c0c0c0);
          font-style: normal;
          transition: all .2s;
        }
        .qchain-stepper .qstep::before {
          content: "○"; font-size: var(--fs-2xs); line-height: 1; color: var(--mute-2);
        }
        .qchain-stepper .qstep.is-done { color: var(--sage); }
        .qchain-stepper .qstep.is-done::before { content: "●"; color: var(--sage); }
        .qchain-stepper .qstep.is-current {
          color: var(--amber-deep); background: var(--amber-wash);
          font-weight: 600;
        }
        .qchain-stepper .qstep.is-current::before { content: "◉"; color: var(--amber-deep); }
        .qchain-stepper .qstep.is-optional::before { content: "◌"; color: var(--mute-2); }
        .qchain-stepper .qstep-arrow {
          flex: 0 0 12px; height: 1px; background: var(--rule);
        }

        /* ── Chain question (Q1/Q2 单选 + 4 级 hint) ──
           适老化字号：题面 15px / 选项 14.5px / hint 13.5px / line-height 1.7 */
        .chain-q { margin-bottom: 12px; }
        .chain-q-stem {
          font-family: var(--serif-cn); font-size: var(--fs-md); color: var(--ink);
          line-height: 1.7; margin: 0 0 12px; padding: 12px 14px;
          background: var(--amber-wash); border-left: 3px solid var(--amber-deep);
          border-radius: 0 6px 6px 0;
        }
        .chain-q-opts { list-style: none; padding: 0; margin: 0; }
        .chain-q-opts li {
          padding: 11px 14px; margin-bottom: 7px;
          border: 1px solid var(--rule); border-radius: 6px;
          background: var(--paper);
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.65;
          cursor: pointer; transition: all .14s;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .chain-q-opts li:hover {
          border-color: var(--amber-soft); background: rgba(217,119,87,0.04);
        }
        .chain-q-opts li.is-wrong {
          border-color: rgba(168,73,42,0.5);
          background: rgba(168,73,42,0.04);
          color: var(--mute);
        }
        .chain-q-opts li.is-wrong::before { content: "✕ "; color: var(--amber-deep); font-weight: 700; }
        .chain-q-opts li.is-correct {
          border-color: var(--sage); background: rgba(106,154,123,0.08);
          color: var(--ink); font-weight: 500;
        }
        .chain-q-opts li.is-correct::before { content: "✓ "; color: var(--sage); font-weight: 700; }
        .chain-q-opts li.is-locked { pointer-events: none; opacity: 0.7; }

        /* ── Hint drawer ── */
        .chain-hint-drawer {
          margin-top: 12px;
          padding: 12px 14px;
          background: var(--paper-2);
          border: 1px dashed var(--rule);
          border-radius: 6px;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink-soft); line-height: 1.7;
          display: none;
        }
        .chain-hint-drawer.is-open { display: block; }
        .chain-hint-item {
          padding: 4px 0;
        }
        .chain-hint-item + .chain-hint-item {
          border-top: 1px dotted rgba(168,73,42,0.18);
          margin-top: 6px; padding-top: 8px;
        }
        .chain-hint-lvl {
          display: inline-block;
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.06em; color: var(--amber-deep);
          background: var(--paper); padding: 1px 6px;
          border-radius: 3px; margin-right: 6px;
        }
        .chain-hint-cta {
          margin-top: 8px; display: flex; gap: 8px; align-items: center;
        }
        .chain-hint-cta .btn-hint {
          font-family: var(--mono); font-size: var(--fs-xs); letter-spacing: 0.04em;
          padding: 5px 12px; background: var(--paper);
          border: 1px solid var(--amber-deep); color: var(--amber-deep);
          border-radius: 4px; cursor: pointer; transition: all .12s;
        }
        .chain-hint-cta .btn-hint:hover {
          background: var(--amber-wash);
        }
        .chain-hint-cta .btn-hint[disabled] {
          opacity: 0.4; cursor: not-allowed;
        }
        .chain-hint-meta {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
          letter-spacing: 0.04em;
        }

        /* ── v6.1 P1: stepper 决策二级状态 + 错答 toast + 完成 CTA ── */
        .qchain-stepper .qstep[data-substep="reflection"]::after {
          content: " · 反思中";
          font-size: 0.85em; opacity: 0.7; font-style: normal;
        }
        .chain-wrong-toast {
          margin: 10px 0 0;
          padding: 8px 12px;
          background: rgba(168,73,42,0.08);
          border-left: 3px solid var(--amber-deep);
          border-radius: 0 6px 6px 0;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--amber-deep);
          animation: chainWrongFadeIn .2s ease-out;
          display: flex; align-items: center; gap: 6px;
        }
        @keyframes chainWrongFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chain-wrong-toast.is-fading { opacity: 0; transition: opacity .3s; }
        .chain-completed-cta {
          margin-top: 14px;
          display: flex; gap: 10px; justify-content: flex-end;
          padding-top: 12px;
          border-top: 1px dashed var(--rule);
        }
        .chain-completed-cta .btn-next-stage {
          font-family: var(--mono); font-size: var(--fs-xs); padding: 8px 16px;
          background: var(--amber-deep); color: var(--ivory);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          cursor: pointer; letter-spacing: 0.04em;
          transition: background .14s;
        }
        .chain-completed-cta .btn-next-stage:hover { background: var(--maroon, #872c14); }
        .chain-completed-cta .btn-next-stage:disabled {
          background: var(--paper-3, #ece5d3); color: var(--mute-2);
          border-color: var(--rule); cursor: not-allowed;
        }
        /* 5×4 矩阵 cell 数字字号升 14px(适老化补完) */
        .figure-card.rich-01 .rm-cell .rm-num { font-size: var(--fs-sm); }
        .figure-card.rich-01 .rm-cell { height: 28px; }

        /* v6.2: 重置题链按钮 */
        .qchain-stepper { position: relative; }
        .qstep-reset {
          margin-left: auto;
          font-family: var(--mono); font-size: var(--fs-2xs);
          padding: 4px 10px; cursor: pointer;
          background: transparent; color: var(--mute);
          border: 1px solid var(--rule); border-radius: 4px;
          letter-spacing: 0.04em;
          transition: all .12s;
        }
        .qstep-reset:hover {
          color: var(--amber-deep); border-color: var(--amber-deep);
          background: var(--amber-wash);
        }

        /* v6.2: Q4 迁移题保存后的样本累积提示 */
        .chain-transfer-saved-note {
          margin: 10px 0 0;
          padding: 8px 12px;
          background: rgba(106,154,123,0.06);
          border-left: 3px solid var(--sage, #6a9a7b);
          border-radius: 0 6px 6px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink-soft); line-height: 1.6;
        }

        /* v6.4 S6 规则卡片 */
        .figure-card.rich-09 .rule-cards {
          display: flex; flex-direction: column; gap: 8px;
          margin: 12px 0 14px;
        }
        .figure-card.rich-09 .rule-card {
          padding: 10px 12px;
          border-left: 3px solid var(--rule);
          background: var(--paper-2);
          border-radius: 0 6px 6px 0;
        }
        .figure-card.rich-09 .rule-card.is-set { border-left-color: var(--sage); }
        .figure-card.rich-09 .rule-card.is-empty {
          border-left-color: var(--amber-deep); border-left-style: dashed;
        }
        .figure-card.rich-09 .rc-head {
          display: flex; align-items: baseline; gap: 8px;
          margin-bottom: 6px; flex-wrap: wrap;
        }
        .figure-card.rich-09 .rc-id {
          font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700;
          color: var(--amber-deep);
          background: var(--amber-wash); padding: 2px 8px; border-radius: 3px;
        }
        .figure-card.rich-09 .rc-t {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
        }
        .figure-card.rich-09 .rc-label {
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); font-weight: 500;
        }
        .figure-card.rich-09 .rc-format {
          font-size: var(--fs-2xs); color: var(--mute);
          margin-bottom: 6px; line-height: 1.55;
        }
        .figure-card.rich-09 .rc-if,
        .figure-card.rich-09 .rc-then {
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); line-height: 1.55;
          display: grid; grid-template-columns: 28px 1fr;
          gap: 8px; padding: 3px 0;
          align-items: baseline;
        }
        .figure-card.rich-09 .rc-kw {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); font-weight: 600;
          background: var(--paper); padding: 2px 4px; border-radius: 3px;
          text-align: center;
        }

        /* v6.5 S2 Bloom 金字塔 */
        .figure-card.rich-04 .bloom-pyramid {
          display: flex; flex-direction: column;
          align-items: center; gap: 6px;
          padding: 14px 0 6px;
        }
        .figure-card.rich-04 .bp-row {
          display: grid; grid-template-columns: 96px 1fr 56px;
          gap: 12px; align-items: center;
          width: 100%; max-width: 380px;
        }
        .figure-card.rich-04 .bp-lvl {
          text-align: right;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); font-weight: 500;
        }
        .figure-card.rich-04 .bp-lvl small {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); margin-right: 6px;
        }
        .figure-card.rich-04 .bp-bar-wrap {
          display: flex; justify-content: center; align-items: center;
          min-height: 26px;
        }
        .figure-card.rich-04 .bp-bar {
          height: 24px;
          border-radius: 3px;
          display: flex; align-items: center; justify-content: flex-end;
          padding: 0 10px;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--ivory); font-weight: 700;
          letter-spacing: 0.02em;
          transition: width .3s ease;
          min-width: 36px;
        }
        .figure-card.rich-04 .bp-bar.is-high  { background: var(--amber-deep); }
        .figure-card.rich-04 .bp-bar.is-mid   { background: var(--amber, #d97757); }
        .figure-card.rich-04 .bp-bar.is-low   { background: var(--sage); }
        .figure-card.rich-04 .bp-bar.is-empty {
          background: transparent;
          border: 1px dashed var(--rule);
          color: var(--mute);
        }
        .figure-card.rich-04 .bp-cov {
          display: flex; gap: 3px; align-items: center;
        }
        .figure-card.rich-04 .bp-cov i {
          width: 10px; height: 10px; border-radius: 2px;
          background: var(--sage); display: inline-block;
        }
        .figure-card.rich-04 .bp-cov i.is-empty {
          background: transparent;
          border: 1px dashed var(--rule);
        }
        .figure-card.rich-04 .bp-meta {
          margin: 12px 22px 4px;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
          text-align: center;
        }
        .figure-card.rich-04 .bp-meta b { color: var(--amber-deep); }

        /* v6.5 S2 目标↔证据 5 对配对 */
        .figure-card.rich-04 .goal-evidence-pairs {
          margin: 14px 22px 6px;
          padding-top: 12px;
          border-top: 1px dashed rgba(168,73,42,0.18);
        }
        .figure-card.rich-04 .ge-pairs-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.06em;
          margin-bottom: 10px;
        }
        .figure-card.rich-04 .ge-pair {
          display: grid; grid-template-columns: 1fr 28px 1fr;
          gap: 10px; align-items: center;
          padding: 7px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .figure-card.rich-04 .ge-pair + .ge-pair {
          border-top: 1px dotted rgba(168,73,42,0.12);
        }
        .figure-card.rich-04 .ge-goal {
          color: var(--ink); text-align: right;
          font-weight: 500;
        }
        .figure-card.rich-04 .ge-arrow {
          font-family: var(--mono); font-size: var(--fs-sm);
          color: var(--amber-deep);
          text-align: center; font-weight: 600;
        }
        .figure-card.rich-04 .ge-evidence {
          color: var(--ink-soft);
          font-size: var(--fs-xs);
        }

        /* v6.4 S8 议程兑现 5×4 热力矩阵 */
        .figure-card.rich-11 .fulfill-matrix {
          display: grid;
          grid-template-columns: 110px repeat(4, 1fr) 52px;
          gap: 5px 6px;
          padding: 8px 0 4px;
        }
        .figure-card.rich-11 .fm-corner,
        .figure-card.rich-11 .fm-row-h {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink); align-self: center;
          padding: 4px 0;
        }
        .figure-card.rich-11 .fm-col-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.06em;
          text-align: center;
          align-self: end; padding-bottom: 4px;
          font-weight: 600;
        }
        .figure-card.rich-11 .fm-cell {
          height: 28px;
          border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700;
          transition: transform .14s, box-shadow .14s;
        }
        .figure-card.rich-11 .fm-cell.is-fulfilled {
          background: var(--sage, #6a9a7b); color: var(--ivory);
        }
        .figure-card.rich-11 .fm-cell.is-empty {
          background: rgba(168,73,42,0.04);
          border: 1px dashed rgba(168,73,42,0.3);
          color: var(--mute-2);
        }
        .figure-card.rich-11 .fm-cell:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        }
        .figure-card.rich-11 .fm-score {
          text-align: center; align-self: center;
          font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700;
          color: var(--ink); padding: 0 4px;
        }
        .figure-card.rich-11 .fm-score.is-low   { color: var(--amber-deep); }
        .figure-card.rich-11 .fm-score.is-full  { color: var(--sage); }
        .figure-card.rich-11 .fm-totals-h {
          padding: 8px 0 0; margin-top: 4px;
          border-top: 1px dashed var(--rule);
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
          align-self: center;
        }
        .figure-card.rich-11 .fm-col-total {
          padding: 8px 0 4px; margin-top: 4px;
          border-top: 1px dashed var(--rule);
          text-align: center;
          font-family: var(--mono); font-size: var(--fs-sm); font-weight: 700;
          color: var(--amber-deep);
        }
        .figure-card.rich-11 .fm-corner-bot {
          padding-top: 8px; margin-top: 4px;
          border-top: 1px dashed var(--rule);
        }
        .figure-card.rich-11 .fm-unfulfill-section {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px dashed rgba(168,73,42,0.18);
        }
        .figure-card.rich-11 .fm-unfulfill-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); letter-spacing: 0.06em;
          margin-bottom: 8px;
        }

        /* v6.4 S2 参与度 2×2 象限图 */
        .figure-card.rich-02 .participation-quads {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 4px; margin: 14px 22px 6px;
          aspect-ratio: 1.6;
          border: 1px solid var(--rule);
          border-radius: 6px;
          position: relative;
        }
        .figure-card.rich-02 .participation-quads::before,
        .figure-card.rich-02 .participation-quads::after {
          content: ""; position: absolute;
          background: var(--rule);
        }
        .figure-card.rich-02 .participation-quads::before {
          left: 50%; top: 6%; bottom: 6%; width: 1px;
        }
        .figure-card.rich-02 .participation-quads::after {
          top: 50%; left: 6%; right: 6%; height: 1px;
        }
        .figure-card.rich-02 .pq-axis-x,
        .figure-card.rich-02 .pq-axis-y {
          position: absolute;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
        }
        .figure-card.rich-02 .pq-axis-x.is-left  { bottom: -16px; left: 2px; }
        .figure-card.rich-02 .pq-axis-x.is-right { bottom: -16px; right: 2px; }
        .figure-card.rich-02 .pq-axis-y.is-top   { top: 2px; left: -54px; }
        .figure-card.rich-02 .pq-axis-y.is-bot   { bottom: 2px; left: -54px; }
        .figure-card.rich-02 .pq-cell {
          padding: 10px 12px;
          display: flex; flex-direction: column;
          justify-content: center; align-items: center;
          gap: 4px;
          font-family: var(--serif-cn); position: relative;
        }
        .figure-card.rich-02 .pq-bubble {
          width: 64px; height: 64px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: var(--fs-md); font-weight: 700;
          color: var(--ivory); position: relative;
          transition: transform .2s;
        }
        .figure-card.rich-02 .pq-bubble:hover { transform: scale(1.08); }
        .figure-card.rich-02 .pq-label {
          font-size: var(--fs-2xs); color: var(--ink); font-weight: 500;
          text-align: center;
        }
        .figure-card.rich-02 .pq-meta {
          margin: 18px 22px 6px;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
        }
        .figure-card.rich-02 .pq-h {
          margin: 14px 22px 0;
          padding-top: 12px;
          border-top: 1px dashed rgba(168,73,42,0.18);
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.08em; color: var(--mute);
        }

        /* v6.4 S5 议程→角色 Sankey 流向图 */
        .figure-card.rich-08 .sankey-wrap {
          margin: 14px 22px 6px; padding-top: 12px;
          border-top: 1px dashed rgba(168,73,42,0.18);
        }
        .figure-card.rich-08 .sankey-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.08em;
          margin-bottom: 8px;
        }
        .figure-card.rich-08 .sankey-svg {
          width: 100%; height: auto; display: block;
        }
        .figure-card.rich-08 .sk-agenda-label,
        .figure-card.rich-08 .sk-role-label {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          fill: var(--ink); font-weight: 500;
        }
        .figure-card.rich-08 .sk-agenda-node {
          fill: rgba(168,73,42,0.4); stroke: var(--amber-deep);
          stroke-width: 1;
        }
        .figure-card.rich-08 .sk-role-node {
          fill: rgba(106,154,123,0.4); stroke: var(--sage);
          stroke-width: 1;
        }
        .figure-card.rich-08 .sk-flow {
          fill: none; stroke: rgba(168,73,42,0.35);
          stroke-width: 8; opacity: 0.65;
          transition: opacity .15s, stroke .15s;
        }
        .figure-card.rich-08 .sk-flow:hover {
          opacity: 1; stroke: var(--amber-deep);
        }

        /* v6.5 Dark mode 系统补全 — v6+ 新加的组件统一覆盖 */
        html[data-theme="dark"] .figure-card.rich-04 .bp-lvl { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-04 .bp-lvl small { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-04 .bp-meta { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-04 .bp-cov i.is-empty { border-color: rgba(255,253,247,.16); }
        html[data-theme="dark"] .figure-card.rich-04 .goal-evidence-pairs { border-top-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-pairs-h { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-pair + .ge-pair { border-top-color: rgba(255,253,247,.06); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-goal { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-evidence { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-arrow { color: var(--amber-soft); }

        /* S2 参与度象限 dark mode */
        html[data-theme="dark"] .figure-card.rich-02 .participation-quads { border-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .figure-card.rich-02 .participation-quads::before,
        html[data-theme="dark"] .figure-card.rich-02 .participation-quads::after { background: rgba(255,253,247,.10); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-label { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-axis-x,
        html[data-theme="dark"] .figure-card.rich-02 .pq-axis-y { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-meta { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-h { color: var(--mute-2); border-top-color: rgba(255,253,247,.10); }

        /* S5 Sankey dark mode */
        html[data-theme="dark"] .figure-card.rich-08 .sankey-wrap { border-top-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .figure-card.rich-08 .sankey-h { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-08 .sk-agenda-label,
        html[data-theme="dark"] .figure-card.rich-08 .sk-role-label { fill: #faf6ee; }

        /* S6 规则卡片 dark mode */
        html[data-theme="dark"] .figure-card.rich-09 .rule-card { background: rgba(255,253,247,.04); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-id {
          background: rgba(217,119,87,0.22); color: var(--amber-soft);
        }
        html[data-theme="dark"] .figure-card.rich-09 .rc-t { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-label { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-format { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-if,
        html[data-theme="dark"] .figure-card.rich-09 .rc-then { color: var(--on-dark); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-kw {
          background: rgba(255,253,247,.06); color: var(--amber-soft);
        }

        /* S8 议程兑现矩阵 dark mode */
        html[data-theme="dark"] .figure-card.rich-11 .fm-corner,
        html[data-theme="dark"] .figure-card.rich-11 .fm-row-h { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-col-h,
        html[data-theme="dark"] .figure-card.rich-11 .fm-totals-h { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-cell.is-empty {
          background: rgba(255,253,247,.04);
          border-color: rgba(255,253,247,.18);
        }
        html[data-theme="dark"] .figure-card.rich-11 .fm-score { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-dim-total,
        html[data-theme="dark"] .figure-card.rich-11 .fm-col-total {
          border-top-color: rgba(255,253,247,.10);
          color: var(--amber-soft);
        }
        html[data-theme="dark"] .figure-card.rich-11 .fm-corner-bot { border-top-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-unfulfill-section { border-top-color: rgba(255,253,247,.10); }

        /* v6+ 题链 controls dark mode 补充 */
        html[data-theme="dark"] .qstep-reset { color: var(--mute-2); border-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .qstep-reset:hover { color: var(--amber-soft); background: rgba(217,119,87,.10); border-color: var(--amber-soft); }
        html[data-theme="dark"] .chain-completed-cta { border-top-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .chain-reflection-helper { color: var(--mute-2); }
        html[data-theme="dark"] .chain-wrong-toast {
          background: rgba(217,119,87,.12); color: var(--amber-soft);
        }
        html[data-theme="dark"] .chain-q-actions { border-top-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .chain-q-actions .chain-meta { color: var(--mute-2); }
        html[data-theme="dark"] .chain-transfer-saved-note {
          background: rgba(106,154,123,.10); color: var(--on-dark);
        }

        /* v6.3: figure cell ↔ question 选项 hover 联动高亮 */
        .chain-q-opts li.is-hover-linked {
          background: var(--amber-wash);
          border-color: var(--amber-deep);
          transform: translateX(2px);
        }
        .figure-card.rich-01 .rm-col-h.is-hover-linked,
        .figure-card.rich-01 .rm-cell.is-hover-linked,
        .figure-card.rich-01 .rm-total.is-hover-linked,
        .figure-card.rich-01 .rm-status.is-hover-linked {
          box-shadow: 0 0 0 2px var(--amber-deep);
          z-index: 2; position: relative;
        }
        .figure-card.rich-01 .rm-cell.is-hover-linked .rm-bar {
          opacity: 0.85;
        }

        /* 反思梯度 helper */
        .chain-reflection-helper {
          margin: 8px 0 0;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.02em;
        }
        .chain-reflection-helper b { color: var(--amber-deep); font-weight: 500; }

        /* ── v6: Q3 反思 / Q4 迁移 内嵌 question-card 样式 ── */
        .chain-q-reflection textarea,
        .chain-q-transfer textarea {
          width: 100%; box-sizing: border-box;
          min-height: 96px; padding: 12px 14px;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          line-height: 1.7; color: var(--ink);
          background: var(--ivory);
          border: 1px solid var(--rule); border-radius: 6px;
          resize: vertical;
          margin-top: 10px;
        }
        .chain-q-reflection textarea:focus,
        .chain-q-transfer textarea:focus {
          border-color: var(--amber-deep); outline: none;
        }
        .chain-q-actions {
          margin-top: 12px; padding-top: 12px;
          border-top: 1px dashed var(--rule);
          display: flex; gap: 10px;
          align-items: center; justify-content: flex-end;
        }
        .chain-q-actions .chain-meta {
          margin-right: auto;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
        }
        .chain-q-actions .btn-s.chain-save {
          font-family: var(--mono); font-size: var(--fs-xs);
          padding: 6px 16px;
          background: var(--amber-deep); color: var(--ivory);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          cursor: pointer; letter-spacing: 0.04em;
          transition: background .14s;
        }
        .chain-q-actions .btn-s.chain-save:hover {
          background: var(--maroon, #872c14);
        }
        .chain-q-actions .btn-s.chain-save[disabled] {
          background: var(--paper-3, #ece5d3); color: var(--mute-2);
          border-color: var(--rule); cursor: not-allowed;
        }
        .chain-q-scaffold {
          margin: 10px 0 12px; padding: 10px 14px;
          background: var(--paper-2); border-left: 2px solid var(--sage);
          border-radius: 0 4px 4px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink-soft); line-height: 1.7;
        }
        .chain-q-scaffold ul { margin: 0; padding-left: 18px; }
        .chain-q-scaffold li + li { margin-top: 4px; }
        html[data-theme="dark"] .chain-q-reflection textarea,
        html[data-theme="dark"] .chain-q-transfer textarea {
          background: #211f1d; color: var(--ivory); border-color: rgba(255,253,247,.10);
        }

        /* ── Inline decision dock (Q3 嵌进 question-card) ── */
        .chain-q-decision .chain-q-trans {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
          letter-spacing: 0.04em; margin: 6px 0 10px;
        }
        .decision-dock.decision-dock-inline {
          margin: 12px 0 0; padding: 0;
          background: transparent; border: none;
        }
        .decision-dock.decision-dock-inline .dd-actions {
          flex-direction: column; align-items: stretch; gap: 8px;
          padding-top: 10px; border-top: 1px dashed var(--rule);
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt {
          text-align: left; padding: 12px 16px;
          font-family: var(--serif-cn); font-size: var(--fs-md);
          line-height: 1.55;
          background: var(--paper); color: var(--ink);
          border: 1px solid var(--rule); border-radius: 6px;
          cursor: pointer; transition: all .14s;
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt:hover {
          border-color: var(--amber-soft);
          background: rgba(217,119,87,0.04);
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt.is-selected {
          border-color: var(--amber-deep); background: var(--amber-wash);
          color: var(--amber-deep); font-weight: 500;
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.fill {
          align-self: flex-end; margin-top: 6px;
          padding: 6px 14px;
        }
        html[data-theme="dark"] .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt {
          background: #2a2722; color: var(--on-dark); border-color: rgba(255,253,247,.10);
        }
        html[data-theme="dark"] .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt:hover {
          background: rgba(217,119,87,0.08);
        }

        /* ── Locked artifact (chain mode + Q4 未完成) ── */
        .artifact.is-chain-locked {
          opacity: 0.55; position: relative;
        }
        .artifact.is-chain-locked .artifact-body,
        .artifact.is-chain-locked button[data-artifact-id] {
          pointer-events: none;
        }
        .artifact-chain-lock {
          padding: 10px 16px;
          background: var(--amber-wash);
          border-bottom: 1px dashed var(--amber-deep);
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.04em; color: var(--amber-deep);
          display: flex; align-items: center; gap: 8px;
        }
        .artifact-chain-lock::before { content: "🔒"; font-size: var(--fs-2xs); }
        html[data-theme="dark"] .artifact-chain-lock {
          background: rgba(217,119,87,0.12);
        }

        /* ── Locked decision dock (Q1/Q2 期间，独立 dock 路径已废弃,留 CSS 兜底) ── */
        .decision-dock.is-chain-locked {
          opacity: 0.55;
          position: relative;
        }
        .decision-dock.is-chain-locked::after {
          content: "请先完成读图与诊断题（Q1 / Q2）才能拍板";
          position: absolute; top: 50%; left: 0; right: 0;
          transform: translateY(-50%);
          text-align: center;
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.06em;
          color: var(--amber-deep);
          background: rgba(255,253,247,0.92);
          padding: 6px 0;
          pointer-events: none;
        }
        .decision-dock.is-chain-locked .dd-actions { pointer-events: none; }

        /* ── 证据门禁：缺上游证据/前置未完成 → 可浏览，但不可拍板/生成产物 ── */
        #stationDetail.is-evidence-locked .decision-dock { opacity: 0.5; position: relative; pointer-events: none; }
        #stationDetail.is-evidence-locked .decision-dock::after {
          content: "🔒 需先补齐上游证据，方可拍板并保存判断";
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.05em;
          color: var(--amber-deep); background: rgba(255,253,247,0.86); text-align: center; padding: 6px 10px; pointer-events: none;
        }
        #stationDetail.is-evidence-locked .artifact { opacity: 0.55; position: relative; }
        #stationDetail.is-evidence-locked .artifact .artifact-body,
        #stationDetail.is-evidence-locked .artifact button[data-artifact-id] { pointer-events: none; }
        .evidence-gate { margin: 0 0 14px; padding: 12px 16px; border-radius: 12px; background: var(--amber-wash); border: 1px solid var(--amber-deep); color: var(--ink); font-size: var(--fs-sm); line-height: 1.55; }
        .evidence-gate .eg-h { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--amber-deep); margin-bottom: 4px; }
        .evidence-gate .eg-h::before { content: "⚠"; }
        .evidence-gate .eg-note { color: var(--ink-soft); font-size: var(--fs-xs); margin-bottom: 8px; }
        .evidence-gate .eg-list { display: flex; flex-direction: column; gap: 7px; }
        .evidence-gate .eg-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .evidence-gate .eg-go { font: var(--fs-2xs)/1.1 var(--mono); padding: 4px 11px; border: 1px solid var(--amber-deep); border-radius: 999px; color: var(--amber-deep); background: transparent; cursor: pointer; }
        .evidence-gate .eg-go:hover { background: var(--amber-deep); color: #fff; }
        .evidence-gate .eg-prod { color: var(--mute-2); font: var(--fs-2xs) var(--mono); }
        .evidence-gate.eg-sub { background: rgba(112,82,168,0.09); border-color: var(--violet); }
        .evidence-gate.eg-sub .eg-h { color: var(--violet); }
        .tile.is-locked { opacity: 0.62; }
        .tile.is-locked .t-lock { margin-left: 3px; font-size: var(--fs-2xs); opacity: 0.85; }

        /* ── Chain extras (Q3 reflection + Q4 transfer) ── */
        .chain-extras { margin-top: 18px; display: flex; flex-direction: column; gap: 14px; }
        .chain-card {
          border: 1px solid var(--rule); border-radius: 10px;
          background: var(--paper); padding: 14px 16px;
        }
        .chain-card-h {
          display: flex; justify-content: space-between; align-items: center;
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--mute);
          padding-bottom: 8px; border-bottom: 1px solid var(--rule);
          margin-bottom: 10px;
        }
        .chain-card-h b { color: var(--ink); }
        .chain-card-stem {
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.7; margin: 0 0 12px;
        }
        .chain-card-scaffold {
          margin: 10px 0 12px; padding: 10px 14px;
          background: var(--paper-2); border-left: 2px solid var(--sage);
          border-radius: 0 4px 4px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs); color: var(--ink-soft);
          line-height: 1.7;
        }
        .chain-card-scaffold ul { margin: 0; padding-left: 18px; }
        .chain-card-scaffold li + li { margin-top: 4px; }
        .chain-card textarea {
          width: 100%; box-sizing: border-box;
          min-height: 80px; padding: 12px 14px;
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.65;
          background: var(--ivory); border: 1px solid var(--rule);
          border-radius: 6px; resize: vertical;
        }
        .chain-card textarea:focus { border-color: var(--amber-deep); outline: none; }
        .chain-card-actions {
          margin-top: 10px; display: flex; gap: 10px; align-items: center;
          justify-content: flex-end;
        }
        .chain-card-actions .chain-meta {
          margin-right: auto; font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
        }
        .chain-card .btn-s.chain-save {
          font-family: var(--mono); font-size: var(--fs-2xs); padding: 5px 12px;
          background: var(--amber-deep); color: var(--ivory);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          cursor: pointer; letter-spacing: 0.04em;
        }
        .chain-card .btn-s.chain-save[disabled] {
          background: var(--paper-3, #ece5d3); color: var(--mute-2);
          border-color: var(--rule); cursor: not-allowed;
        }
        .chain-card.is-saved {
          border-color: var(--sage); background: rgba(106,154,123,0.04);
        }
        .chain-card.is-saved .chain-card-h::after {
          content: "✓ 已保存"; color: var(--sage); font-weight: 600;
        }

        /* ── Consent card (fixed bottom-right) ── */
        .consent-card {
          position: fixed; bottom: 24px; right: 24px; z-index: 9000;
          width: 340px; max-width: calc(100vw - 32px);
          background: var(--ivory); border: 1px solid var(--ink);
          border-radius: 12px; padding: 14px 16px;
          box-shadow: 6px 6px 0 var(--ink);
          font-family: var(--serif-cn); animation: pplFadeIn .22s ease-out;
        }
        .consent-card.is-leaving { opacity: 0; transform: translateY(8px); transition: all .2s; }
        .consent-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 8px;
        }
        .consent-tag {
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.08em;
          color: var(--amber-deep); font-weight: 600;
        }
        .consent-close {
          background: none; border: none; font-size: var(--fs-lg);
          color: var(--mute); cursor: pointer; line-height: 1;
          padding: 0 4px;
        }
        .consent-body .consent-lead {
          font-family: var(--serif-cn); font-size: var(--fs-sm); font-weight: 600;
          color: var(--ink); margin: 0 0 6px;
        }
        .consent-body .consent-text {
          font-size: var(--fs-xs); color: var(--ink-soft); line-height: 1.55;
          margin: 0 0 6px;
        }
        .consent-body .consent-note {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
          letter-spacing: 0.04em; margin: 6px 0 0;
        }
        .consent-actions {
          margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end;
        }
        .consent-actions .btn-s {
          font-family: var(--mono); font-size: var(--fs-2xs); padding: 5px 12px;
          border-radius: 4px; cursor: pointer; letter-spacing: 0.04em;
          border: 1px solid var(--rule); background: var(--paper); color: var(--ink);
        }
        .consent-actions .consent-accept {
          background: var(--amber-deep); color: var(--ivory);
          border-color: var(--amber-deep);
        }

        /* ── Dark mode 覆盖 ── */
        html[data-theme="dark"] .chain-q-stem { background: rgba(217,119,87,0.10); color: var(--ivory); }
        html[data-theme="dark"] .chain-q-opts li { background: #2a2722; border-color: rgba(255,253,247,.10); color: var(--on-dark); }
        html[data-theme="dark"] .chain-q-opts li:hover { background: rgba(217,119,87,0.08); }
        html[data-theme="dark"] .chain-q-opts li.is-correct { background: rgba(106,154,123,0.12); color: var(--ivory); }
        html[data-theme="dark"] .chain-q-opts li.is-wrong { background: rgba(168,73,42,0.10); color: var(--mute-2); }
        html[data-theme="dark"] .chain-hint-drawer { background: rgba(255,253,247,.04); color: var(--on-dark-mute); }
        html[data-theme="dark"] .chain-card { background: #2a2722; border-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .chain-card-stem { color: var(--ivory); }
        html[data-theme="dark"] .chain-card textarea { background: #211f1d; color: var(--ivory); border-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] .consent-card { background: #211f1d; border-color: rgba(255,253,247,.16); color: var(--ivory); }
        html[data-theme="dark"] .consent-body .consent-lead { color: var(--ivory); }
        html[data-theme="dark"] .consent-body .consent-text { color: var(--on-dark); }
        html[data-theme="dark"] .decision-dock.is-chain-locked::after { background: rgba(33,31,29,0.92); color: var(--amber-soft); }

        /* ── S1 三角图气泡 + 4 类定位排序条形图 (A+B 优化) ── */
        .figure-card.rich-01 .bubble .bubble-fill { transition: r .3s ease; }
        .figure-card.rich-01 .bubble.is-top .bubble-fill { fill: var(--amber-deep, #a8492a); }
        .figure-card.rich-01 .bubble.is-top .bubble-halo {
          fill: var(--amber-deep, #a8492a); opacity: 0.18;
        }
        .figure-card.rich-01 .bubble.is-ok .bubble-fill { fill: var(--sage, #6a9a7b); }
        .figure-card.rich-01 .bubble.is-warn .bubble-fill {
          fill: rgba(217,119,87,0.42);
          stroke: var(--amber-deep, #a8492a);
          stroke-width: 1.2;
          stroke-dasharray: 2,2;
        }
        .figure-card.rich-01 .bubble .bubble-val {
          fill: #fff; font-family: var(--mono);
          font-size: var(--fs-2xs); font-weight: 700;
          pointer-events: none;
        }
        .figure-card.rich-01 .bubble.is-warn .bubble-val { fill: var(--ink, #1a1714); }
        .figure-card.rich-01 .bubble .bubble-name {
          fill: var(--ink, #1a1714);
          font-family: var(--serif-cn);
          font-size: var(--fs-2xs);
          font-weight: 500;
          pointer-events: none;
        }
        .figure-card.rich-01 .bubble.is-top .bubble-name {
          fill: var(--amber-deep, #a8492a);
          font-weight: 600;
        }

        /* 4 类定位排序条形图 */
        .figure-card.rich-01 .loc-bars {
          padding: 10px 16px 4px;
          margin-top: 4px;
          border-top: 1px dashed rgba(168,73,42,0.18);
        }
        .figure-card.rich-01 .loc-bars-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.06em; color: var(--mute, #999);
          margin-bottom: 10px;
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px; flex-wrap: wrap;
        }
        .figure-card.rich-01 .loc-expand-all {
          font-family: var(--mono); font-size: var(--fs-2xs);
          padding: 5px 12px; cursor: pointer;
          background: var(--paper); color: var(--amber-deep, #a8492a);
          border: 1px solid var(--amber-deep, #a8492a); border-radius: 4px;
          letter-spacing: 0.04em; white-space: nowrap;
          transition: background .12s, color .12s;
        }
        .figure-card.rich-01 .loc-expand-all:hover { background: var(--amber-wash, #f7e6d8); }
        .figure-card.rich-01 .loc-expand-all .arrow {
          display: inline-block; transition: transform .2s; margin-left: 4px;
        }
        .figure-card.rich-01 .loc-expand-all.is-all-open .arrow { transform: rotate(180deg); }
        .figure-card.rich-01 .loc-row {
          display: grid; grid-template-columns: 90px 1fr 32px 1.3fr 16px;
          gap: 10px; align-items: center; padding: 5px 0;
          font-size: var(--fs-sm);
        }
        .figure-card.rich-01 .loc-toggle {
          font-family: var(--mono); font-size: var(--fs-sm);
          color: var(--mute, #999); text-align: center; line-height: 1;
          transition: transform .2s ease;
        }
        .figure-card.rich-01 .loc-detail[open] .loc-toggle { transform: rotate(180deg); }
        .figure-card.rich-01 .loc-summary {
          list-style: none; cursor: pointer;
          padding: 0; margin: 0;
        }
        .figure-card.rich-01 .loc-summary::-webkit-details-marker { display: none; }
        .figure-card.rich-01 .loc-summary::marker { display: none; }
        .figure-card.rich-01 .loc-summary:hover .loc-toggle {
          color: var(--amber-deep, #a8492a);
        }
        .figure-card.rich-01 .loc-detail {
          padding: 0;
        }
        .figure-card.rich-01 .loc-detail[open] {
          background: rgba(168,73,42,0.025);
          border-radius: 4px;
          padding: 0 4px;
        }

        /* 5 维 rubric breakdown — 适老化字号:dim 13px / val 12px / note 12.5px */
        .figure-card.rich-01 .loc-breakdown {
          padding: 8px 0 12px 90px;
          margin: 4px 0 8px;
          border-left: 2px solid rgba(168,73,42,0.18);
          margin-left: 4px;
        }
        .figure-card.rich-01 .loc-breakdown.is-top { border-left-color: var(--amber-deep, #a8492a); }
        .figure-card.rich-01 .loc-breakdown.is-ok  { border-left-color: var(--sage, #6a9a7b); }
        .figure-card.rich-01 .loc-breakdown.is-warn { border-left-color: rgba(217,119,87,0.5); }
        .figure-card.rich-01 .bd-row {
          display: grid; grid-template-columns: 110px 1fr 54px 1.4fr;
          gap: 10px; align-items: center; padding: 3px 8px;
          font-size: var(--fs-xs);
        }
        .figure-card.rich-01 .bd-dim {
          font-family: var(--serif-cn);
          font-size: var(--fs-xs);
          color: var(--ink-soft, #444);
        }
        .figure-card.rich-01 .bd-track {
          height: 6px; background: rgba(168,73,42,0.05);
          border-radius: 3px; overflow: hidden;
        }
        .figure-card.rich-01 .bd-track i {
          display: block; height: 100%; transition: width .35s ease;
        }
        .figure-card.rich-01 .loc-breakdown.is-top .bd-track i { background: var(--amber-deep, #a8492a); }
        .figure-card.rich-01 .loc-breakdown.is-ok .bd-track i  { background: var(--sage, #6a9a7b); }
        .figure-card.rich-01 .loc-breakdown.is-warn .bd-track i { background: rgba(217,119,87,0.5); }
        .figure-card.rich-01 .bd-val {
          font-family: var(--mono); font-size: var(--fs-2xs);
          text-align: right; color: var(--ink, #1a1714); font-weight: 600;
        }
        .figure-card.rich-01 .bd-note {
          font-family: var(--serif-cn);
          color: var(--mute, #999); font-size: var(--fs-xs);
          line-height: 1.55;
        }
        html[data-theme="dark"] .figure-card.rich-01 .loc-detail[open] { background: rgba(255,253,247,0.04); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-breakdown { border-left-color: rgba(255,253,247,0.18); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-dim { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-val { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-note { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-track { background: rgba(255,253,247,0.06); }
        .figure-card.rich-01 .loc-name {
          font-family: var(--serif-cn);
          color: var(--ink, #1a1714); font-weight: 500;
        }
        .figure-card.rich-01 .loc-track {
          height: 8px; background: rgba(168,73,42,0.05);
          border-radius: 4px; overflow: hidden;
        }
        .figure-card.rich-01 .loc-fill {
          display: block; height: 100%;
          background: var(--mute-2, #c0c0c0);
          transition: width .35s ease;
        }
        .figure-card.rich-01 .loc-row.is-top .loc-fill { background: var(--amber-deep, #a8492a); }
        .figure-card.rich-01 .loc-row.is-ok .loc-fill  { background: var(--sage, #6a9a7b); }
        .figure-card.rich-01 .loc-row.is-warn .loc-fill { background: rgba(217,119,87,0.5); }
        .figure-card.rich-01 .loc-val {
          font-family: var(--mono); font-size: var(--fs-xs);
          text-align: right; color: var(--ink, #1a1714); font-weight: 600;
        }
        .figure-card.rich-01 .loc-row.is-top .loc-val { color: var(--amber-deep, #a8492a); }
        .figure-card.rich-01 .loc-note {
          font-family: var(--serif-cn);
          color: var(--mute, #999); font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .figure-card.rich-01 .loc-row.is-top .loc-name {
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        html[data-theme="dark"] .figure-card.rich-01 .loc-name { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-val { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-note { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-bars { border-top-color: rgba(255,253,247,0.10); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-track { background: rgba(255,253,247,0.06); }
        html[data-theme="dark"] .figure-card.rich-01 .bubble .bubble-name { fill: #faf6ee; }

        /* ── 候选 1：5×4 评分矩阵（替代三角图 + 4 类条形图 + breakdown 抽屉）── */
        .figure-card.rich-01 .alignment-note {
          margin: 6px 0 14px;
          padding: 10px 14px;
          background: var(--paper-2);
          border-left: 3px solid var(--amber-deep);
          border-radius: 0 6px 6px 0;
          font-family: var(--serif-cn);
          font-size: var(--fs-xs);
          line-height: 1.7;
          color: var(--ink-soft);
        }
        .figure-card.rich-01 .alignment-note b {
          color: var(--amber-deep); font-weight: 600;
        }
        .figure-card.rich-01 .rubric-matrix {
          display: grid;
          grid-template-columns: 100px repeat(4, 1fr);
          gap: 4px 6px;
          padding: 6px 0 10px;
        }
        .figure-card.rich-01 .rm-corner {
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.04em; color: var(--mute);
          align-self: end; padding-bottom: 6px;
        }
        .figure-card.rich-01 .rm-col-h {
          padding: 6px 4px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: var(--paper-2);
          cursor: pointer;
          font-family: var(--serif-cn);
          font-size: var(--fs-sm); font-weight: 500;
          color: var(--ink);
          text-align: center;
          transition: all .14s;
        }
        .figure-card.rich-01 .rm-col-h:hover {
          background: var(--amber-wash);
          border-color: var(--amber-soft);
        }
        .figure-card.rich-01 .rm-col-h.is-top {
          background: var(--amber-wash);
          border-color: var(--amber-deep);
          color: var(--amber-deep); font-weight: 600;
        }
        .figure-card.rich-01 .rm-col-h.is-current {
          box-shadow: 0 0 0 2px var(--amber-deep);
          outline: none;
        }
        .figure-card.rich-01 .rm-dim {
          font-family: var(--serif-cn);
          font-size: var(--fs-xs);
          color: var(--ink-soft);
          align-self: center;
          line-height: 1.4;
        }
        .figure-card.rich-01 .rm-dim-total,
        .figure-card.rich-01 .rm-dim-status {
          font-family: var(--mono);
          font-size: var(--fs-2xs);
          letter-spacing: 0.04em;
          color: var(--mute);
        }
        .figure-card.rich-01 .rm-dim-total {
          padding-top: 6px;
          border-top: 1px dashed var(--rule);
          margin-top: 4px;
        }
        .figure-card.rich-01 .rm-cell {
          position: relative;
          height: 26px;
          background: rgba(168,73,42,0.04);
          border-radius: 3px;
          overflow: hidden;
          display: flex; align-items: center; justify-content: flex-end;
          padding: 0 8px;
          cursor: pointer;
          transition: transform .12s, box-shadow .12s;
        }
        .figure-card.rich-01 .rm-cell:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(168,73,42,0.18);
        }
        .figure-card.rich-01 .rm-cell .rm-bar {
          position: absolute; left: 0; top: 0; bottom: 0;
          display: block;
          background: rgba(168,73,42,0.10);
          transition: width .35s ease;
        }
        .figure-card.rich-01 .rm-cell.is-top .rm-bar  { background: rgba(168,73,42,0.30); }
        .figure-card.rich-01 .rm-cell.is-ok .rm-bar   { background: rgba(106,154,123,0.28); }
        .figure-card.rich-01 .rm-cell.is-warn .rm-bar { background: rgba(217,119,87,0.22); }
        .figure-card.rich-01 .rm-cell .rm-num {
          position: relative; z-index: 1;
          font-family: var(--mono); font-size: var(--fs-sm); font-weight: 600;
          color: var(--ink);
        }
        .figure-card.rich-01 .rm-cell.is-top .rm-num {
          color: var(--amber-deep); font-weight: 700;
        }
        .figure-card.rich-01 .rm-total {
          padding: 6px 4px;
          text-align: center;
          font-family: var(--mono);
          font-size: var(--fs-md); font-weight: 700;
          color: var(--ink);
          margin-top: 4px;
        }
        .figure-card.rich-01 .rm-total.is-top {
          color: var(--amber-deep);
          background: var(--amber-wash);
          border-radius: 4px;
        }
        .figure-card.rich-01 .rm-total.is-warn { color: var(--mute-2); }
        .figure-card.rich-01 .rm-status {
          padding: 2px 4px;
          text-align: center;
          font-family: var(--mono);
          font-size: var(--fs-2xs);
          letter-spacing: 0.04em;
        }
        .figure-card.rich-01 .rm-status.is-top  { color: var(--amber-deep); font-weight: 600; }
        .figure-card.rich-01 .rm-status.is-ok   { color: var(--mute); }
        .figure-card.rich-01 .rm-status.is-warn { color: var(--mute-2); }

        /* 详情区 */
        .figure-card.rich-01 .rm-detail {
          margin: 8px 0 12px;
          padding-top: 12px;
          border-top: 1px dashed var(--rule);
        }
        .figure-card.rich-01 .rm-detail-pane { display: none; }
        .figure-card.rich-01 .rm-detail-pane[data-active] { display: block; }
        .figure-card.rich-01 .rm-detail-h {
          display: flex; justify-content: space-between; align-items: baseline;
          flex-wrap: wrap; gap: 8px;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--rule);
        }
        .figure-card.rich-01 .rm-detail-h span {
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); font-weight: 600;
        }
        .figure-card.rich-01 .rm-detail-h small {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          font-style: italic; color: var(--amber-deep);
        }
        .figure-card.rich-01 .rm-detail-list {
          list-style: none; padding: 0; margin: 0;
        }
        .figure-card.rich-01 .rm-detail-list li {
          display: grid;
          grid-template-columns: 110px 50px 1fr;
          gap: 10px;
          padding: 5px 0;
          font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .figure-card.rich-01 .rm-detail-list li + li {
          border-top: 1px dotted rgba(168,73,42,0.12);
        }
        .figure-card.rich-01 .rm-dt-dim {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink-soft);
        }
        .figure-card.rich-01 .rm-dt-val {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); font-weight: 600;
          text-align: right;
        }
        .figure-card.rich-01 .rm-dt-note {
          font-family: var(--serif-cn); color: var(--mute);
          font-size: var(--fs-xs); line-height: 1.6;
        }

        /* dark mode */
        html[data-theme="dark"] .figure-card.rich-01 .alignment-note {
          background: rgba(255,253,247,0.05); color: var(--on-dark-mute);
        }
        html[data-theme="dark"] .figure-card.rich-01 .rm-col-h {
          background: rgba(255,253,247,0.05); color: var(--ivory);
        }
        html[data-theme="dark"] .figure-card.rich-01 .rm-col-h:hover {
          background: rgba(217,119,87,0.18);
        }
        html[data-theme="dark"] .figure-card.rich-01 .rm-cell { background: rgba(255,253,247,0.05); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-cell .rm-num { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-total { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-dim { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-dt-dim { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-dt-note { color: var(--mute-2); }

        /* 前后节承接 折叠抽屉(替代原 spiral-context 永远展开) */
        .figure-card.rich-01 .spiral-disclosure {
          margin-top: 12px;
          border-top: 1px dashed rgba(168,73,42,0.18);
          padding-top: 10px;
        }
        .figure-card.rich-01 .spiral-summary {
          list-style: none; cursor: pointer;
          padding: 6px 0;
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.04em; color: var(--mute, #999);
          display: flex; align-items: center; gap: 6px;
        }
        .figure-card.rich-01 .spiral-summary::-webkit-details-marker { display: none; }
        .figure-card.rich-01 .spiral-summary::marker { display: none; }
        .figure-card.rich-01 .spiral-summary .arrow {
          display: inline-block; transition: transform .2s;
        }
        .figure-card.rich-01 .spiral-disclosure[open] .spiral-summary .arrow {
          transform: rotate(180deg);
        }
        .figure-card.rich-01 .spiral-summary:hover { color: var(--amber-deep, #a8492a); }
      `,document.head.appendChild(t)}();const R=v.length,J={1:{cn:"课程定位",em:"任务分析"},2:{cn:"学情分析",em:"先备知识+经验"},3:{cn:"议程协商",em:"学习者参与"},4:{cn:"学习目标",em:"评价证据"},5:{cn:"内容结构化",em:"问题链设计"},6:{cn:"情境化案例",em:"教学资源"},7:{cn:"教学过程",em:"节奏+学情校准点"},8:{cn:"探究协作",em:"协作任务"},9:{cn:"形成性评价",em:"动态调节"},10:{cn:"表现性评价",em:"量规证据"},11:{cn:"教学反思",em:"资源积累"}},X={2:{text:"进入泛雅，开始互动故事",url:"https://demo.fanya.chaoxing.com/portal"}},ce={5:{time:"2 分钟前",body:'在第 3-4 题加入"立场切换"提示词，预计能把学生发言占比从 41% 拉到 55-60%。'}},ve={pre:{label:"课前 · 设计",tag:"课前 · 设计与准备",pillClass:"pill-amber"},in:{label:"课中 · 实施",tag:"课中 · 实施与调控",pillClass:"pill-sage"},post:{label:"课后 · 沉淀",tag:"课后 · 评价与改进",pillClass:"pill-indigo"}};let H=1,ge=null,pe=null;const ue=e=>String(e).padStart(2,"0"),n=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");function xe(e){return e<H?"is-done":e===H?"is-active":""}function U(){return{done:v.filter(e=>e.id<H).length,active:1,todo:v.filter(e=>e.id>H).length}}function V(e){return l[e+1]||null}function re(e){const t=u[String(e.id)],a=t?t.stageId:fe(),s=F[a]||{inputsFrom:[],outputsTo:[],topCardFromKeys:[],topCardToKeys:[]},r=S=>w.findIndex(L=>L.id===S)+1,o=S=>String(S).padStart(2,"0"),c=window.PharmacoPilotStore,d=(window.PharmacoPilotNavigationContract||{}).ENV_TO_STATIONS||{},g=(window.PharmacoPilotNavigationContract||{}).STAGE_TO_ENV||{},p=S=>{if(!c)return null;const L=g[S],P=L&&d[L]||[];for(const j of P){const G=c.getJudgment(j);if(G&&G.label)return G.label}return null},f=s.inputsFrom.map((S,L)=>{const P=I[S];if(!P)return"";const j=s.topCardFromKeys[L]||"产物",G=p(S),te=G?`<span class="ci-live" title="你在上游环节的实际判断" style="display:block;margin-top:2px;font-size: var(--fs-2xs);color:var(--sage,#6a9a7b);">✓ ${n(G.length>22?G.slice(0,22)+"…":G)}</span>`:"";return`<li><span class="ci-num">${o(r(S))}</span><span class="ci-cn">${n(P.displayName)}</span><span class="ci-key">${n(j)}</span>${te}</li>`}).filter(Boolean).join(""),k=s.topCardToKeys.map(S=>`<span class="chain-key">${n(S)}</span>`).join(""),y=s.outputsTo.length?`<div class="chain-out-note">流向 <b>${s.outputsTo.length}</b> 环节 · ${s.outputsTo.map(S=>{const L=I[S];return L?`<a data-stage="${n(S)}" class="chain-out-link">${o(r(S))} ${n(L.displayName)}</a>`:""}).filter(Boolean).join(" · ")}</div>`:'<p class="chain-empty">本环节为终点 · 无下游</p>',x=s.revisionsTo&&s.revisionsTo.length?`<div class="chain-revision-note">↩ 反向修订 · ${s.revisionsTo.map(S=>{const L=I[S];return L?`<a data-stage="${n(S)}" class="chain-out-link">${o(r(S))} ${n(L.displayName)}</a>`:""}).filter(Boolean).join(" · ")}</div>`:"";return`
        <div class="chain-topcard" aria-label="学习产出链">
          <div class="chain-flow">
            <div class="chain-col chain-in">
              <div class="chain-lbl">↓ 上游输入</div>
              ${f?`<ul class="chain-list">${f}</ul>`:'<p class="chain-empty">本环节为起点 · 无上游</p>'}
            </div>
            <div class="chain-col chain-out">
              <div class="chain-lbl">↑ 本环节产出</div>
              ${k?`<div class="chain-keys">${k}</div>`:""}
              ${y}
              ${x}
            </div>
          </div>
        </div>
      `}function de(){const e=l[H];if(!e)return;const t=J[e.id],a=fe(),s=I[a],r=w.findIndex(f=>f.id===a)+1,o=String(r).padStart(2,"0"),c=s?s.tag:"",d=document.getElementById("sessionStation");d&&(d.innerHTML=`${o} / ${A} · ${n(c)} · ${n(t.cn)}`);const g=document.getElementById("heroMeta");if(g){const f=Le();g.innerHTML=`
          <div class="row"><dt>当前示例</dt><dd><b>《管理学原理》</b> 本科 · 药事管理 24 级</dd></div>
          <div class="row"><dt>本节主题</dt><dd>SWOT 分析</dd></div>
          <div class="row"><dt>当前环节</dt><dd><span class="it">${o} · ${n(s?s.title:t.cn)}</span></dd></div>
          <div class="row"><dt>进度</dt><dd>${f.done} 完成 · ${f.active} 进行中 · ${f.todo} 待开始</dd></div>
        `}const p=document.getElementById("deckProgress");if(p){const f=Le(),k=y=>String(y).padStart(2,"0");p.innerHTML=`
          <b>${k(f.done)}</b> 完成<span class="sep">·</span>
          <span class="stat-live"><i></i>${o} 进行中</span><span class="sep">·</span>
          <b>${k(f.todo)}</b> 待开始
        `}}function Le(){let e=0,t=0,a=0;const s=fe();for(const r of w){if(r.id===s){t++;continue}Fe(r.id)==="is-done"?e++:a++}return{done:e,active:t,todo:a}}function _e(){const e=document.getElementById("stationTiles");e&&(e.innerHTML=v.map(t=>{const a=J[t.id],s=["tile",xe(t.id)].filter(Boolean).join(" "),r=t.id===H?`${ue(t.id)} / ${R}`:ue(t.id);return`<div class="${s}" data-st="${t.id}" role="button" tabindex="0">
          <span class="t-num">${r}</span>
          <span class="t-cn">${n(a.cn)}</span>
          <span class="t-em">${n(a.em)}</span>
        </div>`}).join(""))}function Be(){const e=document.getElementById("nodeList");if(!e)return;const t=[["pre","课前 · 设计"],["in","课中 · 实施"],["post","课后 · 沉淀"]],a=fe();let s="";for(const[o,c]of t){const d=w.filter(g=>g.phase===o);if(d.length){s+=`<li class="node-stage-h">${c}</li>`;for(const g of d){const p=w.findIndex(P=>P.id===g.id)+1,f=g.id===a,k=Fe(g.id),y=["node-item",k,f?"is-active":""].filter(Boolean).join(" "),x=k==="is-done"?'<span class="check">✓</span>':"<span></span>",S=g.subNodeIds&&g.subNodeIds[0],L=typeof S=="number"?S:(u[String(S)]||{}).legacyStationId;s+=`<li class="${y}" data-st="${L||""}" data-stage="${n(g.id)}" role="button" tabindex="0">
            <span class="n">${String(p).padStart(2,"0")}</span>
            <span>${n(g.displayName||g.title)}</span>
            ${x}
          </li>`}}}e.innerHTML=s;const r=document.getElementById("nodeListMeta");r&&(r.textContent=`${Le().done} / ${A}`)}function he(){const e=document.getElementById("stationDetail");if(!e)return;const t=l[H];if(!t)return;const a=ut();e.classList.toggle("is-evidence-locked",a.blocked),e.innerHTML=mt(a)+re(t)+Ae()+De(t)+je()}function Ae(){const e=_();if(!e)return"";const t=u[e];if(!t)return"";if(t.revisionPass==="v1"){const a=window.PharmacoPilotStore,s=I[t.stageId],r=w.findIndex(x=>x.id===t.stageId)+1,o=ue(r),c=(s&&s.subNodeIds||[]).map(String).find(x=>(u[x]||{}).revisionPass==="v0");let d=null;a&&typeof a.getJudgment=="function"&&(d=c&&a.getJudgment(c)||a.getJudgment(t.legacyStationId||1));const g=c?String.fromCharCode(97+s.subNodeIds.map(String).indexOf(c)):"a",p=t.subjectName||"本节点产物",f=t.revisionSource||"前序节点的产出",k=t.revisionAction||`确认或修订${p}，输出锁定版`,y=d?`
            <div class="spb-v0-ref">
              <div class="spb-v0-hd"><span class="spb-v0-tag">前轮草案</span>已保存 · ${n(new Date(d.savedAt).toLocaleString("zh-CN",{hour12:!1}))}</div>
              <div class="spb-v0-body">
                <span class="spb-v0-lbl">${n(d.label||d.key||"判断")}</span>
                ${typeof d.score=="number"?`<span class="spb-v0-score">${d.score.toFixed(1)} / 5</span>`:""}
              </div>
            </div>
          `:`
            <div class="spb-v0-ref spb-v0-empty">
              <div class="spb-v0-hd"><span class="spb-v0-tag">前轮草案</span>尚未保存 · 建议先回到 ${n(o)}·${n(g)} 完成首轮判断再做回写</div>
            </div>
          `;return`
          <div class="sub-pass-banner sub-pass-revision">
            <span class="spb-lbl">${n(t.subTitle||"再修订")} · 基于下游回写</span>
            <span class="spb-body">本节点基于「${n(f)}」的结果回写${n(p)}。前轮判断作为参考保留；本轮要${n(k)}。</span>
            ${y}
          </div>
        `}if(t.mergedWith&&t.mergedWith.length){const a=I[t.stageId],s=`步骤 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / ${(a&&a.subNodeIds||[]).length}`;return`
          <div class="sub-pass-banner sub-pass-merged">
            <span class="spb-lbl">${n(s)} · 合并节点</span>
            <span class="spb-body">学情前测与议程协商在本节点串联完成：先做学情诊断（认知前测 + 经验入口），下拉后做议程协商；两个判断保存为一份合并产物，回写到 v1 定位。</span>
          </div>
        `}if(t.anchorId){const a=I[t.stageId],s=`锚点 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / 3`,r=D(t.legacyStationId||9),c=(r&&r.evidenceFigure&&r.evidenceFigure.pulseRules||[]).find(g=>g.anchorId===t.anchorId),d=c?`
            <div class="spb-anchor-rule">
              <div class="spb-anchor-row"><span class="spb-anchor-k">时间点</span><span class="spb-anchor-v">${n(String(c.t))}'</span></div>
              <div class="spb-anchor-row"><span class="spb-anchor-k">微评估格式</span><span class="spb-anchor-v">${n(c.microFormat)}</span></div>
              <div class="spb-anchor-row"><span class="spb-anchor-k spb-anchor-if">如果</span><span class="spb-anchor-v">${n(c.ifCond)}</span></div>
              <div class="spb-anchor-row"><span class="spb-anchor-k spb-anchor-then">则</span><span class="spb-anchor-v">${n(c.thenAct)}</span></div>
            </div>
          `:'<div class="spb-anchor-rule spb-anchor-empty">本锚点暂无规则模板。请在右侧学情触发规则编辑器写一条「如果 X 则 Y」。</div>';return`
          <div class="sub-pass-banner sub-pass-anchor">
            <span class="spb-lbl">${n(s)} · ${n(t.subTitle||"")}</span>
            <span class="spb-body">硬约束：每个锚点必须有一条「如果 X 则 Y」规则；本学习者议程 个锚点都需独立编辑，否则不允许通过到下一环节。</span>
            ${d}
          </div>
        `}if(t.focus==="objectives"){const a=I[t.stageId],s=`步骤 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / ${(a&&a.subNodeIds||[]).length}`;return`
          <div class="sub-pass-banner sub-pass-stage1">
            <span class="spb-lbl">${n(s)} · 学习目标</span>
            <span class="spb-body">把教学目标改写为可观察、可评价、可由学生产出证明的学习成果。3-5 条为宜，覆盖知识 / 应用 / 高阶判断三个层级；同时回应来自学情诊断（环节 01）的课程定位、学情低分项、议程张力。</span>
          </div>
        `}if(t.focus==="rubric"){const a=I[t.stageId],s=`步骤 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / ${(a&&a.subNodeIds||[]).length}`;let r="";try{const o=window.PharmacoPilotStore,c=o&&o.getRubricRevisions?o.getRubricRevisions("pending"):[];c&&c.length&&(r=`
              <div class="spb-revision-pending">
                <span class="spb-rev-tag">↩ 待审反向修订 · ${c.length} 条</span>
                <span class="spb-rev-hint">来自评价与画像（环节 07）的量规修订建议，必须显式确认或驳回后才能继续。</span>
              </div>
            `)}catch{}return`
          <div class="sub-pass-banner sub-pass-stage2">
            <span class="spb-lbl">${n(s)} · 评价证据 + 5 维量规</span>
            <span class="spb-body">为每条目标设计可采集的评价证据，并配套 5 维量规（一致性 / 真实性 / 学情 / 高阶 / 评价）。每个维度有 4 等级描述符；预留批判意识维度。本节点同时是评价与画像（环节 07）反向修订的收件方。</span>
            ${r}
          </div>
        `}if(t.focus==="scoring"){const a=I[t.stageId],s=`步骤 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / ${(a&&a.subNodeIds||[]).length}`;return`
          <div class="sub-pass-banner sub-pass-data">
            <span class="spb-lbl">${n(s)} · 数据采集 · 评分</span>
            <span class="spb-body">用目标与量规（环节 02）的 5 维量规给学生作品逐条打分。只采集数据，不做评价定性，不写反馈语；产出原始评分表 + 低分维度 Pareto 图。</span>
          </div>
        `}if(t.focus==="feedback-profile"){const a=I[t.stageId],s=`步骤 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / ${(a&&a.subNodeIds||[]).length}`;return`
          <div class="sub-pass-banner sub-pass-teaching">
            <span class="spb-lbl">${n(s)} · 教学动作 · 反馈与画像</span>
            <span class="spb-body">基于评分数据写可行动反馈语（Hattie 反馈层级：任务 / 过程 / 自我调节 / 自我），并把班级低分项汇总为能力画像。每位学生至少一条针对性反馈。</span>
          </div>
        `}if(t.focus==="rubric-revision"){const a=I[t.stageId],s=`步骤 ${(a&&a.subNodeIds||[]).indexOf(e)+1} / ${(a&&a.subNodeIds||[]).length}`;return`
          <div class="sub-pass-banner sub-pass-meta">
            <span class="spb-lbl">${n(s)} · 元动作 · 量规反向修订</span>
            <span class="spb-body">基于本轮评分发现的量规问题（某维度区分度不足 / 过严 / 缺失关键维度），向目标与量规（环节 02）提交修订建议。这是评价与画像（环节 07）→ 目标与量规（环节 02）反向修订通道的发起点；建议会进入环节 02 的「评价证据 + 5 维量规」待审列表，下一轮备课进入该环节前必须显式确认或驳回。</span>
            <div class="spb-revision-outbound">
              <span class="spb-rev-tag">↩ 反向修订发起 · 环节 07 → 环节 02</span>
              <span class="spb-rev-hint">提交后会在环节 02「评价证据 + 5 维量规」节点顶部显示「待审反向修订 N 条」。</span>
            </div>
          </div>
        `}return""}let Oe=!1;function je(){if(!pe)return"";const e=u[pe];if(!e||!e.mergedWith||!e.mergedWith.length)return"";Oe=!0;try{return e.mergedWith.map(a=>{const s=l[a];return s?`
            <div class="merged-section">
              <div class="merged-sep" aria-hidden="true">─── 第 2 段 · 议程协商（${n(s.title)}） ───</div>
              ${De(s)}
            </div>
          `:""}).join("")}finally{Oe=!1}}function De(e){return e.id===1?Qe(e):e.id===3?Ve(e):e.id===5?He(e):e.id===7?Me(e):Je(e)}function be(e,t){if(Oe)return`
          <div class="detail-head detail-head-compact">
            <h3>${n(e.title).replace(/与/g,"<br/>与 ")}</h3>
          </div>
        `;const a=ve[e.phase],s=fe(),r=I[s],o=w.findIndex(p=>p.id===s)+1,c=r?`<span class="pill pill-amber">环节 ${ue(o)} · ${n(r.displayName)}</span>`:"";let d="",g="";if(r&&Array.isArray(r.subNodeIds)&&r.subNodeIds.length){let p=-1;if(pe&&(p=r.subNodeIds.findIndex(f=>String(f)===pe)),p<0&&(p=r.subNodeIds.findIndex(f=>{const k=u[String(f)]||{};return(typeof k.legacyStationId=="number"?k.legacyStationId:Number(f))===e.id})),p>=0){const f=String(r.subNodeIds[p]),k=u[f]||{};r.subNodeIds.length>1&&(d=`<span class="pill pill-indigo">步骤 ${p+1} / ${r.subNodeIds.length}</span>`),g=k.subTitle||""}}return`
        <div class="detail-head">
          <div class="detail-tags">
            ${c}
            ${d}
            <span class="pill ${a.pillClass}">${n(a.tag)}</span>
            <span class="right">
              <span class="pill pill-mute">${t.length} 个判断选项</span>
              <span class="pill pill-mute">${e.qualityDimensions.length} 维评价</span>
            </span>
          </div>
          <h3>${g?n(g):n(e.title).replace(/与/g,"<br/>与 ")}</h3>
        </div>
      `}function ze(e){const t=e.slice().sort((r,o)=>(o[3]||0)-(r[3]||0)),a=t.filter(r=>r[4]&&r[4].recommended===!0).map(r=>r[0]),s=new Set(a);if(s.size===0&&t.length){const r=t[0],o=t[1];(!o||(r[3]||0)>(o[3]||0))&&s.add(r[0])}return function(o){const[c,,,d,g]=o;return g&&g.blockSave?{bucket:"avoid",label:"禁条"}:s.has(c)?{bucket:"rec",label:"推荐"}:(d||0)<3?{bucket:"avoid",label:"不建议"}:{bucket:"alt",label:"备选"}}}function ke(e){return(window.PharmacoPilotQuestionChain||{})[e]||null}function Ke(e){const t=window.PharmacoPilotStore;return!t||!t.getChainProgress?1:t.getChainProgress(e).currentStep||1}function We(e){const t=window.PharmacoPilotStore;return!t||!t.getChainProgress?{}:t.getChainProgress(e).reflections||{}}function Ee(e){const t=window.PharmacoPilotStore;if(!t||!t.getJudgment)return null;let a=t.getJudgment(e.id);if(!a&&window.__navRenderState&&window.__navRenderState.currentSubKey){const s=window.__navRenderState.currentSubKey();s&&(a=t.getJudgment(s))}return a}function Te(e,t){const a=window.PharmacoPilotStore,s=a&&a.getChainProgress?a.getChainProgress(e.id):{reflections:{}},r=Ee(e),o=a&&a.getTransfer?a.getTransfer(e.id):[],c=(t.chain||[]).find(L=>L.step===3),d=c&&c.postSelectReflection&&c.postSelectReflection.field,g=s.reflections||{},p=!!(d&&g[d]),f=!!s.q1Done,k=!!s.q2Done,y=!!r,x=o.length>0;let S;return f?k?!y||!p?S=3:x?S=5:S=4:S=2:S=1,{current:S,q1Done:f,q2Done:k,q3DecisionDone:y,q3ReflectionDone:p,q4Done:x,judgment:r}}function qe(e,t){const a=t.q3DecisionDone&&!t.q3ReflectionDone,s=[{step:1,name:"读图",done:t.q1Done},{step:2,name:"诊断",done:t.q2Done},{step:3,name:"决策",done:t.q3DecisionDone&&t.q3ReflectionDone,substep:a?"reflection":""},{step:4,name:"迁移",done:t.q4Done,optional:!0}],r=t.current,c=r>1?`<button class="qstep-reset" data-reset-chain="${e}" title="重置本节点的所有答题进度">↻ 重置题链</button>`:"";return`<div class="qchain-stepper" data-station="${e}">${s.map((d,g)=>{let p="";d.done?p="is-done":d.step===r?p="is-current":d.optional&&(p="is-optional");const f=d.substep?` data-substep="${d.substep}"`:"",k=g<s.length-1?'<span class="qstep-arrow"></span>':"";return`<i class="qstep ${p}" data-step="${d.step}"${f}>${d.name}</i>${k}`}).join("")}${c}</div>`}function b(e,t){const a=window.PharmacoPilotStore,s=a&&a.getObservations?a.getObservations(e,t.step):[],r=new Set(s.filter(S=>S.event==="chose"&&S.isCorrect===!1).map(S=>S.choiceKey)),o=s.some(S=>S.event==="chose"&&S.isCorrect===!0),c=Math.max(0,...s.filter(S=>S.event==="hintRevealed").map(S=>S.hintLevel||0)),d=e===1&&t.step===1?{comprehensive:"综合决策型",research:"证据研究型",policy:"政策治理型",service:"服务运营型"}:null,g=t.options.map(S=>{let L="";r.has(S.key)&&(L="is-wrong"),o&&S.correct===!0&&(L="is-correct"),o&&(L+=" is-locked");const P=d&&d[S.key]?` data-link-col="${n(d[S.key])}"`:"",j=L.includes("is-locked");return`<li class="${L.trim()}" data-opt-key="${n(S.key)}" data-correct="${S.correct?"1":"0"}"${P}
          role="radio" tabindex="${j?"-1":"0"}" aria-checked="${o&&S.correct===!0?"true":"false"}"${j?' aria-disabled="true"':""}>
          ${n(S.label)}
        </li>`}).join(""),p=t.kind==="observation"?"读图题 · 你看到了什么":t.kind==="diagnosis"?"诊断题 · 这意味着什么":"题目",f=(t.hints||[]).slice(0,c).map(S=>`
        <div class="chain-hint-item">
          <span class="chain-hint-lvl">L${S.level} · ${n(S.kind)}</span>
          <span>${n(S.text)}</span>
        </div>
      `).join(""),k=c>0?"is-open":"",y=(t.hints||[]).length,x=c>=y;return`
        <div class="chain-q" data-station="${e}" data-step="${t.step}">
          <div class="qcard-lbl"><span>${n(p)}</span><b>Q${t.step} / 4</b></div>
          <p class="chain-q-stem">${n(t.stem)}</p>
          <ul class="chain-q-opts" role="radiogroup" aria-label="${n(p)}">${g}</ul>
          <div class="chain-hint-drawer ${k}" data-drawer-step="${t.step}">${f}</div>
          <div class="chain-hint-cta">
            <button class="btn-hint" data-hint-station="${e}" data-hint-step="${t.step}" ${x?"disabled":""}>
              ${c===0?"需要提示":`查看 L${c+1} 提示`}
            </button>
            <span class="chain-hint-meta">已用 ${c} / ${y} 级提示 · 4 级是兜底答案</span>
          </div>
        </div>
      `}function i(e,t,a){const s=t&&t.transitionLine||"",r=a.map(c=>{const[d,g]=c;return`<button class="btn-s dd-opt" data-key="${n(d)}">${n(g)}</button>`}).join(""),o=e&&e.decisionQuestion||"请做出你的判断";return`
        <div class="chain-q chain-q-decision" data-step="3">
          <div class="qcard-lbl"><span>决策题 · 你来拍板</span><b>Q3 / 4</b></div>
          <p class="chain-q-stem">${n(o)}</p>
          ${s?`<p class="chain-q-trans">${n(s)}</p>`:""}
          <div class="decision-dock decision-dock-inline">
            <div class="dd-actions">
              ${r}
              <button class="btn-s fill dd-save" disabled aria-disabled="true">保存判断</button>
            </div>
          </div>
        </div>
      `}function m(e,t,a,s){const r=t&&t.postSelectReflection&&t.postSelectReflection.field||"reflection",o=t&&t.postSelectReflection&&t.postSelectReflection.prompt||"用一句话写下你的理由",c=t&&t.postSelectReflection&&t.postSelectReflection.placeholder||"一句话说明...",d=t&&t.postSelectReflection&&t.postSelectReflection.gradient||["不算","勉强算","算"],g=s[r],p=g?"":`
        <p class="chain-reflection-helper">参考梯度: ${d.map((f,k)=>`<b>${n(f)}</b>`).join(" → ")} — 选择最贴近你判断的那个,然后说明理由</p>
      `;return`
        <div class="chain-q chain-q-reflection" data-chain-card="reflection" data-station="${e.id}" data-field="${n(r)}" data-step="3r">
          <div class="qcard-lbl"><span>Q3 反向提问 · 写下你的理由</span><b>${n(a.label||a.key)}</b></div>
          <p class="chain-q-stem">${n(o)}</p>
          ${p}
          <textarea data-reflection-input maxlength="500" placeholder="${n(c)}" ${g?"disabled":""}>${n(g?g.text:"")}</textarea>
          <div class="chain-q-actions">
            <span class="chain-meta"></span>
            <button class="btn-s chain-save" data-save-reflection ${g?"disabled":""}>${g?"已保存 ✓":"保存理由"}</button>
          </div>
        </div>
      `}function T(e,t,a){const s=window.PharmacoPilotStore,r=s&&s.getTransfer?s.getTransfer(e.id):[],o=r[r.length-1],c=t&&t.transferAxis||a&&a.transferAxis||"",d=(t&&t.scaffold||[]).map(g=>`<li>${n(g)}</li>`).join("");return`
        <div class="chain-q chain-q-transfer" data-chain-card="transfer" data-station="${e.id}" data-axis="${n(c)}" data-step="4">
          <div class="qcard-lbl"><span>Q4 迁移题 · 把判断推到新场景</span><b>迁移轴 · ${n(c)}</b></div>
          <p class="chain-q-stem">${n(t.stem)}</p>
          ${d?`<div class="chain-q-scaffold"><ul>${d}</ul></div>`:""}
          <textarea data-transfer-input maxlength="800" placeholder="不评判对错,写出你的判断逻辑..." ${o?"disabled":""}>${n(o?o.text:"")}</textarea>
          <div class="chain-q-actions">
            <span class="chain-meta">开放题 · 不评判对错 · 可选(跳过不影响产物生成)</span>
            <button class="btn-s chain-skip" data-skip-transfer ${o?"disabled":""}>跳过</button>
            <button class="btn-s chain-save" data-save-transfer ${o?"disabled":""}>${o?"已保存 ✓":"保存迁移判断"}</button>
          </div>
        </div>
      `}function $(e){const t=typeof fe=="function"?fe():null,a=w.findIndex(f=>f.id===t),s=a>=0&&a<w.length-1?w[a+1]:null,r=window.PharmacoPilotStore,o=r&&r.getTransfer?r.getTransfer(e.id):[],c=o[o.length-1],g=c&&!c.skipped&&c.text?`
        <p class="chain-transfer-saved-note">
          ✓ 你的迁移判断已存入本地 · 样本累积中——后续其他教师的回答会被聚合成参考分布
        </p>
      `:"";let p="";if(s){const f=(s.subNodeIds||[])[0],k=typeof f=="number"?f:(u[String(f)]||{}).legacyStationId,y=typeof f=="number"?"":String(f),x=ue(a+2);p=`
          <div class="chain-completed-cta">
            <button class="btn-s btn-next-stage" onclick="window.__navSetStation(${k}, '${n(s.id)}', '${n(y)}')">
              下一环节 · ${n(x)} ${n(s.displayName)} →
            </button>
          </div>
        `}else p=`
          <div class="chain-completed-cta">
            <button class="btn-s btn-next-stage" disabled>已是最后环节 · 整套教学设计走完</button>
          </div>
        `;return`
        <div class="chain-q" data-step="done">
          <div class="qcard-lbl"><span>题链完成</span><b>4 / 4</b></div>
          <p class="chain-q-stem">
            ✓ 读图、诊断、决策、迁移 4 步已全部完成 — 下方「产物生成区」已解锁,可生成本节点产物。
          </p>
          ${g}
          ${p}
        </div>
      `}function C(e){return""}function E(e,t){const a=ke(e.id);if(a&&a.chain&&a.chain.length){const c=Te(e,a),d=qe(e.id,c),g=c.current,p=We(e.id);let f="";if(g===1||g===2){const k=a.chain.find(y=>y.step===g);f=k?b(e.id,k):""}else if(g===3){const k=a.chain.find(y=>y.step===3);if(c.judgment)f=m(e,k,c.judgment,p);else{const y=(window.PharmacoPilotDecisionBank||{})[e.id]||[];f=i(e,k,y)}}else if(g===4){const k=a.chain.find(y=>y.step===4);f=T(e,k,a)}else f=$(e);return`
          <div class="question-card chain-mode" data-chain-station="${e.id}">
            ${d}
            ${f}
          </div>
        `}const s=ze(t),r={rec:0,alt:0,avoid:0,none:0},o=t.map(c=>{const[d,g,p,f]=c,k=s(c);r[k.bucket]++;const y=k.label?`<span class="ann ann-${k.bucket}${k.bucket==="rec"?" fork":""}">${n(k.label)}</span>`:"",x=typeof f=="number"?`<span class="qopt-score">score <b>${f.toFixed(1)}</b></span>`:"",S=p?`<div class="qopt-rationale">${n(p)}</div>`:"";return`<li data-key="${n(d)}" data-bucket="${k.bucket}">
          <div class="qopt-head"><span class="qopt-label">${n(g)}</span>${y}${x}</div>
          ${S}
        </li>`}).join("");return`
        <div class="question-card">
          <div class="qcard-lbl"><span>DECISION · ${t.length} 个选项</span><b>${n(e.artifactType.split(/[、，,]/)[0])}</b></div>
          <p class="qcard-prompt">${n(e.decisionQuestion)}</p>
          <ol class="qchain qchain-rich">${o}</ol>
          <div class="qchain-foot">
            <span><b>${r.rec}</b> 推荐 · <b>${r.alt}</b> 备选 · <b>${r.avoid}</b> 不建议</span>
            <span class="qchain-note">本节点只做一个判断 →</span>
          </div>
        </div>
      `}function O(e,t){if(ke(e.id))return"";const a=ze(t),s=t.find(o=>a(o).bucket==="rec")||t[0]||[null,"暂无选项","",0],r=t.map(o=>{const[c,d]=o,g=a(o),p=["btn-s","dd-opt",g.bucket==="rec"?"is-recommend":"",g.bucket==="avoid"?"is-avoid":""].filter(Boolean).join(" "),f=g.bucket==="rec"?"（推荐）":g.bucket==="alt"?"（备选）":g.bucket==="avoid"?"（不建议）":"";return`<button class="${p}" data-key="${n(c)}">${n(d)}${f}</button>`}).join("");return`
        <div class="decision-dock">
          <div class="dd-l">
            <strong>本节点只做一个判断 ——</strong>
            <p>${n(e.decisionQuestion)} 推荐路径：<b>${n(s[1])}</b>。</p>
          </div>
          <div class="dd-actions">
            ${r}
            <button class="btn-s fill dd-save" disabled aria-disabled="true">保存判断</button>
          </div>
        </div>
      `}function z(e){const t=fe(),a=I[t],s=w.findIndex(y=>y.id===t)+1,r=ue(s),o=a?`# 环节 ${r} · ${n(a.displayName)} · ${n(e.title)}`:`# ${n(e.title)}`,c=ke(e.id),d=window.PharmacoPilotStore,g=c&&d&&d.getTransfer?(d.getTransfer(e.id)||[]).length>0:!1,p=!!c&&!g;let f="完成全部 4 阶题链后解锁";if(c&&typeof Te=="function")try{const y=Te(e,c);f="题链进度 "+((y.q1Done?1:0)+(y.q2Done?1:0)+(y.q3DecisionDone&&y.q3ReflectionDone?1:0)+(y.q4Done?1:0))+" / 4 · "+(y.current===5?"已完成":y.current===4?"等 Q4 迁移题(可跳过)":y.current===3?y.q3DecisionDone?"等 Q3 反思":"等 Q3 决策":"等 Q"+y.current)}catch{}const k=p?`<div class="artifact-chain-lock">${n(f)}</div>`:"";return`
        <div class="artifact${p?" is-chain-locked":""}">
          ${k}
          <div class="artifact-h">
            <span>本节点产物 · <b>${n(et(e))}</b> · 待生成</span>
            <span>评价维度 ${e.qualityDimensions.length}</span>
          </div>
          <div class="artifact-body">
<span class="k">${o}</span><br/>
<span class="s">## 关键教学判断</span><br/>
${n(e.userMindset)}<br/>
<span class="s">## 本节点要做的</span><br/>
${n(e.what)}<br/>
<span class="s">## 为什么</span><br/>
${n(e.why)}<br/>
<span class="s">## 产物类型</span><br/>
${n(e.artifactType)}<br/>
<span class="s">## 评价依据</span><br/>
${e.qualityDimensions.map(y=>n(y)).join(" · ")}<br/>
<span class="s">## 后台校验点（隐藏式）</span><br/>
${e.backendCheckpoints.map(y=>`[${n(y)}]`).join(" ")}
          </div>
        </div>
      `}function K(e){return`
        <details class="station-intro-disclosure">
          <summary class="sid-summary">
            <span class="sid-label">本节点说明</span>
            <span class="sid-preview">${n(e.what)}</span>
            <span class="sid-caret" aria-hidden="true">⌄</span>
          </summary>
          <div class="station-intro">
            <div class="intro-card">
              <span class="intro-lbl">本节点要做的</span>
              <p>${n(e.what)}</p>
            </div>
            <div class="intro-card">
              <span class="intro-lbl">为什么这么做</span>
              <p>${n(e.why)}</p>
            </div>
            <div class="intro-card">
              <span class="intro-lbl">怎么做</span>
              <p>${n(e.how)}</p>
            </div>
          </div>
        </details>
      `}function ne(e){return`
        <div class="figure-card scaffold">
          <div class="fcard-lbl"><span>FIGURE · 图示设计中</span><b>${n(e.evidenceFigure.split(/\s*[\/＋+]\s*/)[0])}</b></div>
          <div class="scaffold-body" aria-label="图示占位">
            <div class="scaffold-mark">◇</div>
            <p class="scaffold-lead">本节点证据图正在设计中：</p>
            <p class="scaffold-evidence">${n(e.evidenceFigure)}</p>
          </div>
          <div class="figure-foot">
            <span>来源 · 站内数据载荷</span>
          </div>
        </div>
      `}function ye(e){if(e.id===2)return Z();if(e.id===4){const t=_(),a=t?u[t]:null;return a&&a.focus==="rubric"?ee():ae()}if(e.id===6)return se();if(e.id===8)return ie();if(e.id===9)return $e();if(e.id===10){const t=_(),a=t?u[t]:null,s=a&&a.focus;return s==="scoring"?Ie():s==="rubric-revision"?Ne():Pe()}return e.id===11?me():ne(e)}function Z(){const e=W(2),t=[["Q1 · SWOT 中 W 指什么",65,18,14,3],["Q2 · S 与 W 的判定边界",32,30,30,8],["Q3 · O / T 来自内 / 外部",41,16,36,7],["Q4 · 同时为 S 与 T 的情景",19,30,38,13]],a=e&&e.preTest&&e.preTest.length?e.preTest.map(r=>{const o=Math.max(0,Math.min(100,Number(r.correctPct)||0)),c=100-o,d=Math.round(c*.3),g=Math.round(c*.45),p=Math.max(0,c-d-g);return[r.q,o,d,g,p]}):t,s=e&&e.preTest?e.preTest.filter(r=>r.commonMisconception).sort((r,o)=>r.correctPct-o.correctPct)[0]:null;return`
        <div class="figure-card rich-02">
          <div class="fcard-lbl"><span>FIGURE · 学情分布</span><b>前测 4 题 · N=32</b></div>
          <div class="pre-legend">
            <span class="leg"><i class="seg-good"></i>掌握</span>
            <span class="leg"><i class="seg-part"></i>部分</span>
            <span class="leg"><i class="seg-misc"></i>误区</span>
            <span class="leg"><i class="seg-none"></i>未答</span>
          </div>
          <div class="prediag-rows">
            ${a.map(([r,o,c,d,g])=>`
              <div class="pre-row">
                <span class="pre-q">${n(r)}</span>
                <div class="pre-bar">
                  <i class="seg-good" style="width:${o}%"></i>
                  <i class="seg-part" style="width:${c}%"></i>
                  <i class="seg-misc" style="width:${d}%"></i>
                  <i class="seg-none" style="width:${g}%"></i>
                </div>
                <span class="pre-v">${o}%</span>
              </div>
            `).join("")}
          </div>
          <div class="pre-callout">
            <span class="pre-mark">★</span>
            <span><b>怎么用</b> · 最低正确率题背后藏的不是"基础差"而是具体误区(本班 → <b>${n(s?s.commonMisconception:"S 与 T 互斥")}</b>) — 本节问题链要专门做这个边界的澄清。</span>
          </div>
          ${(()=>{const r=e&&e.participationQuadrants||[];if(!r.length)return"";const o=k=>r.find(y=>y.label===k)||{pct:0,color:"#888"},c=o("主动 + 高知"),d=o("被动 + 高知"),g=o("主动 + 低知"),p=o("被动 + 低知"),f=k=>`
              <div class="pq-cell">
                <div class="pq-bubble" style="background:${n(k.color||"#888")}">${k.pct}%</div>
                <div class="pq-label">${n(k.label||"")}</div>
              </div>
            `;return`
              <div class="pq-h">参与度 2 维分群 · 主动性 × 知识水平 · N=32</div>
              <div class="participation-quads" aria-label="参与度二维象限">
                ${f(d)}
                ${f(c)}
                ${f(p)}
                ${f(g)}
                <span class="pq-axis-x is-left">← 被动</span>
                <span class="pq-axis-x is-right">主动 →</span>
                <span class="pq-axis-y is-top">↑ 高知识</span>
                <span class="pq-axis-y is-bot">↓ 低知识</span>
              </div>
              <p class="pq-meta">气泡大小 ~ 该象限学生比例 · ${p.pct}% 被动低知组需低门槛入口 + 角色支持</p>
            `})()}
          <div class="figure-foot">
            <span>来源 · 课前 1 周前测 · 闻道认知诊断包</span>
            ${e&&e.preTest&&e.preTest.length?`
              <details class="figure-drill"><summary>展开题目 →</summary>
                <ol class="drill-list">
                  ${e.preTest.map(r=>`<li><b>${n(r.q)}</b> · 正确率 ${n(String(r.correctPct))}%${r.commonMisconception?` <span class="drill-misc">误区：${n(r.commonMisconception)}</span>`:""}</li>`).join("")}
                </ol>
              </details>
            `:'<span class="figure-foot-note">前测题目库（样例 4 题已在上图展示）</span>'}
          </div>
        </div>
      `}function ae(){const e=W(4),t=[["L6","创造",6,0],["L5","评价",14,1],["L4","分析",22,3],["L3","应用",28,2],["L2","理解",22,2],["L1","记忆",8,3]],a=e&&e.bloomDistribution||null,s=a?[...a].reverse().map((c,d)=>{const g=`L${6-d}`,p=c.percent,f=Math.min(3,Math.max(0,Math.round(d*.65)));return[g,c.level,p,f]}):t,r=s.find(([c,d,g,p])=>(c==="L5"||c==="L6")&&g>=10&&p<2),o=240;return`
        <div class="figure-card rich-04">
          <div class="fcard-lbl"><span>FIGURE · 认知层级金字塔</span><b>Bloom 6 层 × 证据覆盖</b></div>
          <div class="bloom-pyramid">
            ${s.map(([c,d,g,p])=>{const f=c==="L5"||c==="L6"?"is-high":c==="L3"||c==="L4"?"is-mid":"is-low",k=Math.max(36,Math.round(o*(g/32))),y=g===0?"is-empty":f;return`
                <div class="bp-row">
                  <span class="bp-lvl"><small>${n(c)}</small>${n(d)}</span>
                  <div class="bp-bar-wrap">
                    <div class="bp-bar ${y}" style="width:${k}px;">${g}%</div>
                  </div>
                  <div class="bp-cov" title="证据覆盖 ${p}/3">
                    ${[0,1,2].map(x=>`<i class="${x<p?"":"is-empty"}"></i>`).join("")}
                  </div>
                </div>
              `}).join("")}
          </div>
          <p class="bp-meta">
            ↑ 高阶能力(评价/创造) · ↓ 基础能力(记忆/理解) · 条宽 ~ 目标占比 · 右侧方块 = 评价证据覆盖
          </p>
          ${(()=>{const c=e&&e.goalEvidenceMap||[];return c.length?`
              <div class="goal-evidence-pairs">
                <div class="ge-pairs-h">目标 ↔ 评价证据 · Backward Design 闭环</div>
                ${c.map(d=>`
                  <div class="ge-pair">
                    <div class="ge-goal">${n(d.goal||"")}</div>
                    <div class="ge-arrow">→</div>
                    <div class="ge-evidence">${n(d.evidence||"")}</div>
                  </div>
                `).join("")}
              </div>
            `:""})()}
          <div class="bloom-gap">
            <b>★ 怎么用</b> · ${r?`${n(r[1])}层有目标但右侧证据方块亮得少 — 给"能${n(r[1])}"配可观察证据,否则目标无法被评估`:"高阶层证据覆盖良好"}
          </div>
          <div class="figure-foot">
            <span>来源 · 目标设计稿 v0.2 · 10 个学习目标</span>
            <details class="figure-drill"><summary>展开数据 →</summary>
              <ol class="drill-list">
                ${s.map(([c,d,g,p])=>`<li><b>${n(d)}（${n(c)}）</b> · ${g}% · 证据覆盖 ${p}/3</li>`).join("")}
              </ol>
            </details>
          </div>
        </div>
      `}function ee(){const e=W(4),t=[{dim:"一致性",full:"目标—活动—评价对齐",cur:3,cov:2,levels:["目标与评价脱节","部分目标有证据","多数目标可被产出证明","每条目标都配对齐证据"]},{dim:"真实性",full:"药事情境真实度",cur:3,cov:2,levels:["纯课本概念","贴药事标签","嵌入真实政策/案例","高仿真集采决策情境"]},{dim:"学情",full:"学情诊断与差异支持",cur:2,cov:1,levels:["不分层","提到前测","目标回应低分项","为差异学生留不同入口"]},{dim:"高阶",full:"认知参与与高阶思维",cur:2,cov:1,levels:["停在记忆/理解","到应用","到分析","到评价/创造·TOWS"]},{dim:"评价",full:"评价证据与反馈效度",cur:2,cov:1,levels:["无可采集证据","有分数无描述符","有 4 等级描述符","可解释达成并导改进"]}],a=e&&e.rubric5d&&e.rubric5d.length?e.rubric5d:t,s=a.filter(o=>(o.cov||0)<2).map(o=>o.dim),r=o=>{const c=(o.levels||[]).map((p,f)=>{const k=f+1,y=k===o.cur;return`<div class="r4r-cell${y?" is-cur":""}" style="flex:1;min-width:0;padding:4px 5px;border:1px solid ${y?"var(--amber-deep)":"var(--rule,#e7e1d8)"};border-radius:4px;background:${y?"rgba(217,119,87,.12)":"transparent"};font-size: var(--fs-2xs);line-height:1.3;color:${y?"var(--amber-deep)":"var(--mute,#8a8178)"};"><b style="display:block;font-size: var(--fs-2xs);letter-spacing:.04em;opacity:.7;">L${k}</b>${n(p)}</div>`}).join(""),d=Math.max(0,Math.min(3,Number(o.cov)||0)),g=[0,1,2].map(p=>`<i style="display:inline-block;width:8px;height:8px;margin-left:2px;border-radius:1px;background:${p<d?"var(--amber-deep)":"rgba(168,73,42,.15)"};"></i>`).join("");return`
          <div class="r4r-row" style="display:flex;align-items:stretch;gap:8px;margin:6px 0;">
            <div class="r4r-dim" style="width:84px;flex:none;">
              <b style="display:block;font-size: var(--fs-xs);color:var(--ink);">${n(o.dim)}</b>
              <small style="font-size: var(--fs-2xs);color:var(--mute,#8a8178);line-height:1.25;">${n(o.full||"")}</small>
            </div>
            <div class="r4r-levels" style="flex:1;display:flex;gap:4px;">${c}</div>
            <div class="r4r-cov" style="width:32px;flex:none;text-align:right;align-self:center;" title="证据覆盖 ${d}/3">${g}</div>
          </div>
        `};return`
        <div class="figure-card rich-04b">
          <div class="fcard-lbl"><span>FIGURE · 5 维量规矩阵</span><b>5 维 × 4 等级 · 证据覆盖热图</b></div>
          <div style="display:flex;gap:10px;font-size: var(--fs-2xs);color:var(--mute,#8a8178);letter-spacing:.04em;margin:2px 0 6px;">
            <span><i style="display:inline-block;width:8px;height:8px;border:1px solid var(--amber-deep);border-radius:2px;background:rgba(217,119,87,.12);vertical-align:middle;"></i> 当前设计等级</span>
            <span style="margin-left:auto;"><i style="display:inline-block;width:8px;height:8px;background:var(--amber-deep);border-radius:1px;vertical-align:middle;"></i> 证据覆盖 /3</span>
          </div>
          ${a.map(r).join("")}
          <div class="bloom-gap" style="margin-top:8px;">
            <b>★ 怎么用</b> · ${s.length?`${n(s.join(" / "))} 维只到 L2、证据覆盖偏低 — 先为高阶目标（TOWS / 批判）配可观察证据，并补「批判意识」描述符，否则量规判不出高低`:"5 维均 ≥ L3 且证据覆盖良好"}
          </div>
          <div class="figure-foot">
            <span>来源 · 量规设计稿 v0.2 · 5 维 × 4 等级</span>
            <details class="figure-drill"><summary>展开量规细则 →</summary>
              <ol class="drill-list">
                ${a.map(o=>`<li><b>${n(o.dim)} · ${n(o.full||"")}</b><br/>${(o.levels||[]).map((c,d)=>`<span style="display:block;padding-left:6px;font-size: var(--fs-2xs);">· L${d+1} ${n(c)}</span>`).join("")}</li>`).join("")}
              </ol>
            </details>
          </div>
        </div>
      `}function se(){const e=W(6),t=[["事实",78,{status:"ok"}],["政策",62,{status:"ok"}],["数据",55,{status:"warn"}],["角色",38,{status:"miss"}],["边界",34,{status:"miss"}]],a=e&&e.bars&&e.bars.length?e.bars:t,s=e&&e.agendaCoverageDots||[],r=D(6)&&D(6).exampleCase&&D(6).exampleCase.subject||"案例",o=e&&e.dataNotice||null,c={ok:"var(--sage)",warn:"var(--amber)",miss:"var(--amber-deep)"};return`
        <div class="figure-card rich-06">
          <div class="fcard-lbl"><span>FIGURE · 案例证据密度</span><b>${n(r)} · ${a.length} 维证据</b></div>
          ${o?`
            <div class="evd-data-notice" style="margin:6px 0 10px;padding:7px 10px;background:rgba(184,134,11,.08);border-left:3px solid var(--amber,#b8860b);font-size: var(--fs-2xs);color:var(--amber-deep,#a8492a);line-height:1.45;border-radius:0 4px 4px 0;">
              ${n(o.text||"⚠ 当前为示例数据")}
            </div>
          `:""}
          <div class="evdensity-wrap">
            <div class="evdensity-bars">
              ${a.map(d=>{const g=d[2]||{},p=c[g.status]||"var(--mute-2)",f=g.status==="ok"?"✓":g.status==="warn"?"⚠":g.status==="miss"?"✕":"";return`
                  <div class="evd-row">
                    <span class="evd-lbl">${n(d[0])}</span>
                    <span class="evd-track"><i style="width:${Math.max(0,Math.min(100,d[1])).toFixed(1)}%;background:${p}"></i></span>
                    <span class="evd-val" style="color:${p}">${d[1]}% ${f}</span>
                  </div>
                `}).join("")}
            </div>
            ${s.length?`
              <div class="evd-agendas">
                <div class="evd-agendas-hd">议程 → 证据对照</div>
                <div class="evd-agendas-row">
                  ${s.map(d=>`
                    <span class="evd-agenda ${d.covered?"is-covered":"is-miss"}" title="${n(d.evidenceSrc||"缺证据")}">
                      <i></i><small>${n(d.label||d.agendaKey)}</small>
                    </span>
                  `).join("")}
                </div>
              </div>
            `:""}
          </div>
          <div class="evd-callout">
            <b>★ 怎么用</b> · miss 状态 = 学生只能凭常识填表的维度 — 不补上,SWOT 就退化为"猜想 + 形容词"。
          </div>
          <div class="figure-foot">
            <span>来源 · ${n(r)} 材料包 · 议程对照表（来自学习者议程环节）</span>
            ${s.length?`
              <details class="figure-drill"><summary>展开案例资料 →</summary>
                <ol class="drill-list">
                  ${s.map(d=>`<li><b>${n(d.label||d.agendaKey)}</b> · ${d.covered?`证据：${n(d.evidenceSrc||"已覆盖")}`:'<span class="drill-misc">缺证据，待补</span>'}</li>`).join("")}
                </ol>
              </details>
            `:'<span class="figure-foot-note">案例资料（样例已在上图展示）</span>'}
          </div>
        </div>
      `}function ie(){const e=W(8),a=(e&&e.bars||[["资料员",72],["判断员",66],["质询员",48],["汇报员",58]]).slice(0,4).map((r,o)=>{const c=r[0],d=Number(r[1]||60),g=(r[2]||{}).status;if(g==="warn"||g==="miss"||d<55)return{role:c,items:[[0,28,"collect","收集"],[30,16,"block","卡壳 ★"],[48,48,"output","补救+产出"]]};const f=Math.round(16+d*.08),k=Math.round(28+d*.1),y=100-f-k-4;return{role:c,items:[[0,f,"collect","数据收集"],[f+2,k,"debate","立场辨析"],[f+k+4,y,"output","结构化产出"]]}}),s=e&&e.roleTimeBudget||null;return`
        <div class="figure-card rich-08">
          <div class="fcard-lbl"><span>FIGURE · 探究泳道</span><b>4 组 × 13 分钟微实战</b></div>
          <div class="swim-body">
            <div class="swim-axis">
              <span>0'</span><span>4'</span><span>9'</span><span>13'</span>
            </div>
            ${a.map(({role:r,items:o})=>`
              <div class="swim-lane">
                <span class="swim-lbl">${n(r)}</span>
                <div class="swim-track">
                  ${o.map(([c,d,g,p])=>`
                    <span class="swim-card seg-${g}" style="left:${c}%;width:${d}%"><b>${n(p)}</b></span>
                  `).join("")}
                </div>
              </div>
            `).join("")}
          </div>
          <div class="swim-legend">
            <span><i class="seg-collect"></i>数据收集</span>
            <span><i class="seg-debate"></i>立场辨析</span>
            <span><i class="seg-block"></i>卡壳干预</span>
            <span><i class="seg-output"></i>产出</span>
          </div>
          <div class="swim-callout">
            <b>★ 怎么用</b> · 卡壳段(amber-deep)= 教师必须介入点 — 备好"立场切换 / 反例对照 / 数据解读模板"3 类追问脚本。
          </div>
          ${(()=>{const r=e&&e.roleSuggestions||[];if(!r.length)return"";const o=["资料员","判断员","质询员","汇报员"],c=480,d=220,g=150,p=350,f=10,k=r.length,y=j=>30+j/Math.max(k-1,1)*(d-60),x=j=>30+j/Math.max(o.length-1,1)*(d-60),S=r.map((j,G)=>{const te=o.indexOf(j.suggestedRole);if(te<0)return"";const Q=y(G),le=x(te),oe=g+70,we=p-70;return`<path class="sk-flow" d="M${g+f} ${Q} C ${oe} ${Q}, ${we} ${le}, ${p} ${le}" data-agenda="${n(j.agendaKey)}" data-role="${n(j.suggestedRole)}"><title>${n(j.agendaText)} → ${n(j.suggestedRole)} · ${n(j.reason)}</title></path>`}).join(""),L=r.map((j,G)=>{const te=y(G);return`
                <rect class="sk-agenda-node" x="${g}" y="${te-8}" width="${f}" height="16" />
                <text class="sk-agenda-label" x="${g-6}" y="${te+4}" text-anchor="end">${n(j.agendaText)}</text>
              `}).join(""),P=o.map((j,G)=>{const te=x(G);return`
                <rect class="sk-role-node" x="${p}" y="${te-10}" width="${f}" height="20" />
                <text class="sk-role-label" x="${p+f+6}" y="${te+4}" text-anchor="start">${n(j)}</text>
              `}).join("");return`
              <div class="sankey-wrap">
                <div class="sankey-h">议程 → 角色 推荐流向 · 5 议程 × 4 角色 · 还原议程贯通第 3 回响点</div>
                <svg class="sankey-svg" viewBox="0 0 ${c} ${d}" preserveAspectRatio="xMidYMid meet" aria-label="议程到角色 Sankey 流向图">
                  ${S}
                  ${L}
                  ${P}
                </svg>
              </div>
            `})()}
          <div class="figure-foot">
            <span>来源 · 课堂时间线 · 角色意愿表 ASG-3417</span>
            ${s&&s.sequence?`
              <details class="figure-drill"><summary>展开任务卡 →</summary>
                <ol class="drill-list">
                  ${s.sequence.map(r=>`<li><b>${n(r.primaryRole)}</b> · ${r.t}'–${r.end}' · ${n(r.desc)}</li>`).join("")}
                </ol>
              </details>
            `:'<span class="figure-foot-note">任务卡（4 角色泳道已在上图展示）</span>'}
          </div>
        </div>
      `}function $e(){const e=_(),t=e&&u[e]&&u[e].anchorId||null,a=W(7),s=W(9),r=a&&a.zpdAnchors||(s&&s.pulseRules||[]).map(L=>({id:L.anchorId,t:L.t,label:L.microFormat}))||[{id:"Z1",t:5,label:""},{id:"Z2",t:22,label:""},{id:"Z3",t:38,label:""}],o=Math.max(...r.map(L=>L.t),45),c=window.PharmacoPilotStore,d=c&&c.getAllPulseRules&&c.getAllPulseRules(),g=s&&s.pulseRules||[],p=d&&Object.keys(d).length>0,f={};p?Object.keys(d).forEach(L=>{f[L]=Object.assign({anchorId:L},d[L])}):g.forEach(L=>{f[L.anchorId]=L});const k=r.map(L=>{const P=f[L.id]||{};return`
          <div class="rule-card ${!!(P.ifCond||P.thenAct)?"is-set":"is-empty"}${L.id===t?" is-active":""}" data-anchor="${n(L.id)}"${L.id===t?' style="outline:2px solid var(--amber-deep);outline-offset:1px;border-radius:5px;background:rgba(217,119,87,.06);"':""}>
            <div class="rc-head">
              <span class="rc-id">${n(L.id)}</span>
              <span class="rc-t">${L.t}'</span>
              <span class="rc-label">${n(L.label||P.microFormat||"")}</span>
              ${L.id===t?'<span style="margin-left:auto;font-size: var(--fs-2xs);font-weight:600;color:var(--amber-deep);letter-spacing:.06em;">▶ 当前</span>':""}
            </div>
            ${P.microFormat?`<div class="rc-format">微评估: ${n(P.microFormat)}</div>`:""}
            <div class="rc-if">
              <span class="rc-kw">如果</span>
              <span>${n(P.ifCond||"(待写触发条件)")}</span>
            </div>
            <div class="rc-then">
              <span class="rc-kw">则</span>
              <span>${n(P.thenAct||"(待写课堂动作)")}</span>
            </div>
          </div>
        `}).join(""),y=p?"已保存":"推荐(待教师确认)",x=L=>40+L/o*270,S=[0,o/3,o*2/3,o].map(L=>Math.round(L));return`
        <div class="figure-card rich-09">
          <div class="fcard-lbl"><span>FIGURE · 反馈触发</span><b>理解曲线 + ${r.length} 学情校准点${t?` · 当前 ${n(t)}`:""} · 总 ${o}'</b></div>
          <div class="pulse-wrap">
            <svg class="pulse-svg" viewBox="0 0 320 200" aria-label="理解曲线">
              <line x1="40" y1="20" x2="40" y2="160" stroke="var(--rule)"/>
              <line x1="40" y1="160" x2="310" y2="160" stroke="var(--rule)"/>
              <line x1="40" y1="68" x2="310" y2="68" stroke="var(--amber-deep)" stroke-dasharray="2,3" opacity="0.5"/>
              <text x="305" y="64" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--amber-deep)">阈值 60%</text>
              <text x="34" y="24" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--mute)">100%</text>
              <text x="34" y="72" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--mute)">60%</text>
              <text x="34" y="164" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--mute)">0%</text>
              ${S.map((L,P)=>`<text x="${[40,130,220,310][P]}" y="178" text-anchor="middle" font-family="var(--mono)" font-size="9" fill="var(--mute)">${L}'</text>`).join("")}
              <!-- area + line (固定形状，仅作示意) -->
              <path d="M 40 100 Q 80 78, 110 88 T 170 60 Q 200 95, 230 78 T 310 38 L 310 160 L 40 160 Z" fill="rgba(217,119,87,0.10)"/>
              <path d="M 40 100 Q 80 78, 110 88 T 170 60 Q 200 95, 230 78 T 310 38" fill="none" stroke="var(--amber-deep)" stroke-width="2"/>
              <!-- ZPD anchors（按 payload t 值动态定位） -->
              ${r.map(L=>{const P=x(L.t),j=L.id===t;return`
                  ${j?`<circle cx="${P.toFixed(1)}" cy="160" r="9" fill="none" stroke="var(--amber-deep)" stroke-width="1.5"/>`:""}
                  <g transform="translate(${P.toFixed(1)},160)"><polygon points="0,-7 -6,4 6,4" fill="var(--amber-deep)" opacity="${j?1:.4}"/></g>
                  <text x="${P.toFixed(1)}" y="178" text-anchor="middle" font-family="var(--mono)" font-size="${j?10:9}" fill="var(--amber-deep)" font-weight="${j?700:500}" opacity="${j?1:.55}">${n(L.id)}</text>
                `}).join("")}
            </svg>
            <div class="pulse-legend">
              <span><i class="li-amber-line"></i>班级理解率</span>
              <span><i class="li-dash"></i>反馈阈值</span>
              <span><i class="li-triangle"></i>学情校准点</span>
            </div>
          </div>
          <!-- v6.4: 规则卡片作为主视觉(规则是 S6 节点的核心产出) -->
          <div class="rule-cards" data-source="${n(y)}">
            ${k}
          </div>
          <div class="pulse-callout">
            <b>★ 怎么用</b> · 曲线每跌破阈值线 → 立即查对应锚点规则卡 → 1 分钟内决定继续/暂停/重启。
          </div>
          <div class="figure-foot">
            <span>动态学情触发 · 实时采集自 AI 虚拟班</span>
            ${(()=>{const L=window.PharmacoPilotStore,P=L&&L.getAllPulseRules&&L.getAllPulseRules(),j=s&&s.pulseRules||[],G=P&&Object.keys(P).length?Object.keys(P).map(Q=>Object.assign({anchorId:Q},P[Q])):j;if(!G.length)return'<span class="figure-foot-note">锚点规则（在课中调控环节生成产物后写入）</span>';const te=P&&Object.keys(P).length?"已保存":"推荐";return`<details class="figure-drill"><summary>展开锚点规则 →</summary>
                <ol class="drill-list">
                  ${G.map(Q=>`<li><b>${n(Q.anchorId)}（${Q.t||"?"}'）</b> · 若 ${n(Q.ifCond||"—")} → ${n(Q.thenAct||"—")} <span class="drill-misc">[${te}]</span></li>`).join("")}
                </ol>
              </details>`})()}
          </div>
        </div>
      `}function Pe(){const e=W(10),t=[["论证严谨度",72,{status:"ok"}],["立场清晰度",78,{status:"ok"}],["证据丰富度",76,{status:"ok"}],["合作贡献",61,{status:"miss"}],["表达流畅度",58,{status:"miss"}],["同伴反馈质量",70,{status:"ok"}]],a=window.PharmacoPilotStore,s=a&&(a.getJudgment("10-a")||a.getJudgment(10)),r=a&&a.getArtifacts&&(a.getArtifacts(10)||[]).find(Q=>Q.artifactId==="rubric-5d"),o=!!(s&&s.score);let c=e&&e.bars&&e.bars.length?e.bars:t;o&&r&&r.data&&Array.isArray(r.data.scores)&&(c=r.data.scores.map(Q=>[Q.dim,Q.score,{status:Q.score>=70?"ok":Q.score>=50?"warn":"miss"}]));const d=o?"实测班级评分":"样例评分",g=c.length,p=90,f=140,k=130,y=80,x=Q=>-Math.PI/2+2*Math.PI*Q/g,S=(Q,le)=>{const oe=x(Q);return[Math.cos(oe)*p*le,Math.sin(oe)*p*le]},L=Q=>{const[le,oe]=S(Q,1.18);return[f+le,k+oe+4]},P=Q=>Array.from({length:g},(le,oe)=>S(oe,Q)).map(([le,oe])=>`${le.toFixed(1)},${oe.toFixed(1)}`).join(" "),j=c.map((Q,le)=>{const oe=Math.max(0,Math.min(100,Number(Q[1]||0)))/100,[we,Ze]=S(le,oe);return`${we.toFixed(1)},${Ze.toFixed(1)}`}).join(" "),G=c.map((Q,le)=>{const oe=Q[2]||{};if(oe.status!=="miss"&&oe.status!=="warn")return"";const we=Number(Q[1]||0)/100,[Ze,Ye]=S(le,we);return`<circle cx="${Ze.toFixed(1)}" cy="${Ye.toFixed(1)}" r="4" fill="var(--amber-deep)"/>`}).join(""),te=c.filter(Q=>(Q[2]||{}).status==="miss").map(Q=>`${n(Q[0])} ${Q[1]}%`);return`
        <div class="figure-card rich-10">
          <div class="fcard-lbl"><span>FIGURE · 量规雷达</span><b>${g} 维评价 · ${d}</b></div>
          ${o?"":`
            <div class="rubric-data-notice" style="margin:6px 0 10px;padding:7px 10px;background:rgba(184,134,11,.08);border-left:3px solid var(--amber,#b8860b);font-size: var(--fs-2xs);color:var(--amber-deep,#a8492a);line-height:1.45;border-radius:0 4px 4px 0;">
              ⚠ 当前为样例评分。在子节点 10-a 完成 5 维量规评分后，能力画像将基于实测数据重新生成。
            </div>
          `}
          <div class="rubric-wrap">
            <svg class="rubric-svg" viewBox="-50 -20 380 290" preserveAspectRatio="xMidYMid meet" aria-label="量规雷达">
              <g transform="translate(${f},${k})">
                <polygon points="${P(.33)}" fill="none" stroke="rgba(168,73,42,0.10)"/>
                <polygon points="${P(.66)}" fill="none" stroke="rgba(168,73,42,0.10)"/>
                <polygon points="${P(1)}"  fill="none" stroke="rgba(168,73,42,0.20)"/>
                ${Array.from({length:g},(Q,le)=>{const[oe,we]=S(le,1);return`<line x1="0" y1="0" x2="${oe.toFixed(1)}" y2="${we.toFixed(1)}" stroke="rgba(168,73,42,0.18)"/>`}).join("")}
                <!-- 目标线 ${y}% -->
                <polygon points="${P(y/100)}" fill="rgba(106,154,123,0.08)" stroke="var(--sage)" stroke-width="1" stroke-dasharray="3,3"/>
                <!-- 当前班级 -->
                <polygon points="${j}" fill="rgba(217,119,87,0.20)" stroke="var(--amber-deep)" stroke-width="2" stroke-linejoin="round"/>
                ${G}
              </g>
              ${c.map((Q,le)=>{const[oe,we]=L(le),Ye=(Q[2]||{}).status==="miss"?" ★":"",vt=oe>f+5?"start":oe<f-5?"end":"middle";return`<text x="${oe.toFixed(1)}" y="${we.toFixed(1)}" text-anchor="${vt}" font-family="var(--serif-cn)" font-size="11" fill="var(--ink)" font-weight="500">${n(Q[0])}${Ye}</text>`}).join("")}
            </svg>
            <div class="rubric-legend">
              <span class="leg"><i class="li-amber"></i>当前班级</span>
              <span class="leg"><i class="li-dash-sage"></i>目标线 ${y}%</span>
              <span class="leg"><i class="li-star"></i>低分维度 ×${te.length||0}</span>
            </div>
          </div>
          <div class="rubric-callout">
            <b>★ 怎么用</b> · 高阶维度(批判 / TOWS)需专题训练 — 基础维度(证据性)1 节课即可改善 — 优先级见 S8 复盘。
          </div>
          <div class="figure-foot">
            <span>来源 · ${n(e&&e.subtitle||"课后作品 32 份")}</span>
            ${e&&e.rubric&&e.rubric.length?`
              <details class="figure-drill"><summary>展开量规细则 →</summary>
                <ol class="drill-list">
                  ${e.rubric.map(Q=>`<li><b>${n(Q.dim)}</b><br/>${(Q.levels||[]).map(le=>`<span style="display:block;padding-left:6px;font-size: var(--fs-2xs);">· ${n(le)}</span>`).join("")}</li>`).join("")}
                </ol>
              </details>
            `:'<span class="figure-foot-note">量规细则（5 维已在雷达图展示）</span>'}
          </div>
        </div>
      `}function Ie(){const e=W(10),t=e&&e.bars&&e.bars.length?e.bars:[["条目证据性",46,{status:"miss"}],["内外分类准确性",78,{status:"ok"}],["条目精炼度",62,{status:"warn"}],["TOWS 可操作性",44,{status:"miss"}],["批判意识",38,{status:"miss"}]],a=e&&e.paretoLowDimensions&&e.paretoLowDimensions.length?e.paretoLowDimensions:[{dim:"批判意识",mean:38,weightInTotal:.28},{dim:"TOWS 可操作性",mean:44,weightInTotal:.24},{dim:"条目证据性",mean:46,weightInTotal:.22}],s=f=>f==="miss"?"var(--amber-deep)":f==="warn"?"var(--amber,#b8860b)":"var(--sage)",r=f=>{const k=Math.max(0,Math.min(100,Number(f[1])||0)),y=(f[2]||{}).status;return`<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
          <span style="width:96px;flex:none;font-size: var(--fs-2xs);color:var(--ink);">${n(f[0])}</span>
          <div style="flex:1;height:12px;background:rgba(0,0,0,.05);border-radius:3px;overflow:hidden;"><i style="display:block;height:100%;width:${k}%;background:${s(y)};border-radius:3px;"></i></div>
          <span style="width:28px;flex:none;text-align:right;font-size: var(--fs-2xs);font-weight:600;color:${s(y)};">${k}</span>
        </div>`},o=Math.max(...a.map(f=>f.weightInTotal||0),.01),c=a.reduce((f,k)=>f+(k.weightInTotal||0),0)||1;let d=0;const g=f=>{d+=f.weightInTotal||0;const k=Math.round(d/c*100);return`<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size: var(--fs-2xs);">
          <span style="width:96px;flex:none;color:var(--amber-deep);font-weight:600;">${n(f.dim)}</span>
          <span style="width:46px;flex:none;color:var(--mute,#8a8178);">均分 ${f.mean}</span>
          <div style="flex:1;height:8px;background:rgba(168,73,42,.10);border-radius:2px;overflow:hidden;"><i style="display:block;height:100%;width:${Math.round((f.weightInTotal||0)/o*100)}%;background:var(--amber-deep);"></i></div>
          <span style="width:54px;flex:none;text-align:right;color:var(--mute,#8a8178);">累计 ${k}%</span>
        </div>`},p=a[0]||{dim:"—",mean:"—"};return`
        <div class="figure-card rich-10a">
          <div class="fcard-lbl"><span>FIGURE · 评分采集</span><b>5 维原始评分 · 低分维度 Pareto</b></div>
          <div style="font-size: var(--fs-2xs);color:var(--mute,#8a8178);letter-spacing:.04em;margin:2px 0 6px;">5 组作品均分 · 只采集数据，不做定性、不写反馈</div>
          ${t.map(r).join("")}
          <div style="margin-top:9px;font-size: var(--fs-2xs);color:var(--mute,#8a8178);letter-spacing:.04em;">低分维度 Pareto · 排下一轮优先项</div>
          ${a.map(g).join("")}
          <div class="bloom-gap" style="margin-top:8px;"><b>★ 怎么用</b> · 最该优先补的是「${n(p.dim)}」（均分 ${p.mean}）— 本步只采集，反馈语在下一步「反馈与画像」写</div>
          <div class="figure-foot"><span>来源 · 课后作品 32 份 · 5 组</span></div>
        </div>
      `}function Ne(){const e=W(10),a=(e&&e.paretoLowDimensions&&e.paretoLowDimensions.length?e.paretoLowDimensions:[{dim:"批判意识",mean:38},{dim:"TOWS 可操作性",mean:44},{dim:"条目证据性",mean:46}]).map(r=>({dim:r.dim,mean:r.mean,fix:(Number(r.mean)||0)<45?"4 等级描述符区分度不足 — 补行为锚点 + 药事实例，明确合格线":"证据要求偏宽 — 收紧合格线，要求可复核出处"})),s=r=>`
        <div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:6px 8px;border:1px solid var(--rule,#e7e1d8);border-radius:5px;background:rgba(217,119,87,.04);">
          <span style="flex:none;width:86px;font-size: var(--fs-2xs);font-weight:600;color:var(--amber-deep);line-height:1.3;">${n(r.dim)}<br/><small style="font-weight:400;color:var(--mute,#8a8178);">均分 ${r.mean}</small></span>
          <span style="flex:1;font-size: var(--fs-2xs);line-height:1.45;color:var(--ink);">${n(r.fix)}</span>
        </div>`;return`
        <div class="figure-card rich-10c">
          <div class="fcard-lbl"><span>FIGURE · 量规反向修订</span><b>低分维 → 修订项 → 回写 S2</b></div>
          <div style="font-size: var(--fs-2xs);color:var(--mute,#8a8178);letter-spacing:.04em;margin:2px 0 6px;">把本轮量规暴露的问题反向修订到「环节 02 目标与量规」</div>
          ${a.map(s).join("")}
          <div class="bloom-gap" style="margin-top:6px;"><b>↩ 回写通道</b> · 确认后经 rubricRevision 通道送回 S2；S2 须显式确认或驳回后方可继续（教学评一体化闭环）</div>
          <div class="figure-foot"><span>来源 · 本轮 5 维评分 · ${a.length} 条修订建议</span></div>
        </div>
      `}function me(){return(typeof fe=="function"?fe():"S8")==="S9"?Xe():Ce()}function Ce(){const e=window.PharmacoPilotStore,t=window.PharmacoPilotNavigationContract||{},a={4:"S2",6:"S4",8:"S5",11:"S8"},s=e&&e.getAgendas()||[],r=e&&e.dump().agendaFulfillment||{},o=e&&e.getZpdAnchors()||[],c=e&&e.getAllPulseRules()||{},d=e&&e.getAgendaUnfulfillmentNotes&&e.getAgendaUnfulfillmentNotes()||{},g=[4,6,8,11],p=["S2","S4","S5","S8"];let f="";if(s.length){const x=['<div class="fm-corner">议程＼站点</div>',...p.map(P=>`<div class="fm-col-h">${n(P)}</div>`),'<div class="fm-col-h">兑现</div>'];s.forEach(P=>{x.push(`<span class="fm-row-h">${n(P.text||P.key)}</span>`),g.forEach(te=>{const Q=r[te]&&r[te][P.key];x.push(Q?`<div class="fm-cell is-fulfilled" title="${n(a[te])} 已兑现">✓</div>`:`<div class="fm-cell is-empty" title="${n(a[te])} 未兑现"></div>`)});const j=g.filter(te=>r[te]&&r[te][P.key]).length,G=j===4?"is-full":j===0?"is-low":"";x.push(`<span class="fm-score ${G}">${j}/4</span>`)}),x.push('<span class="fm-totals-h">合计兑现</span>'),g.forEach(P=>{const j=s.filter(G=>r[P]&&r[P][G.key]).length;x.push(`<div class="fm-col-total">${j} / ${s.length}</div>`)}),x.push('<div class="fm-corner-bot"></div>');const S=s.filter(P=>g.filter(G=>r[G]&&r[G][P.key]).length<g.length),L=S.length?`
          <div class="fm-unfulfill-section">
            <div class="fm-unfulfill-h">未兑现原因记录 (${S.length} 条有缺口)</div>
            ${S.map(P=>{const j=d[P.key]&&d[P.key].reason;return`
                <details class="ar-note" style="margin: 6px 0;">
                  <summary style="cursor:pointer;font-family:var(--mono);font-size: var(--fs-2xs);color:var(--amber-deep);list-style:none;padding:4px 0;">
                    <span>${j?"✏ "+n(P.text)+" · 已记录":"＋ "+n(P.text)}</span>
                  </summary>
                  <div style="display:flex;gap:6px;margin-top:5px;">
                    <textarea class="ar-note-input" data-agenda-key="${n(P.key)}" placeholder="例：学生未在小组讨论中提及 / 证据材料不足 / 时间不够…" rows="2" style="flex:1;font-family:inherit;font-size: var(--fs-2xs);padding:5px 7px;border:1px solid rgba(168,73,42,.25);border-radius:4px;resize:vertical;">${n(j||"")}</textarea>
                    <button class="btn-s ar-note-save" data-agenda-key="${n(P.key)}" style="white-space:nowrap;padding:5px 10px;font-size: var(--fs-2xs);">保存</button>
                  </div>
                </details>
              `}).join("")}
          </div>
        `:"";f=`
          <div class="fulfill-matrix">${x.join("")}</div>
          ${L}
        `}else f='<div class="ar-empty">无议程数据 · 先到 S1 / S3 采集</div>';const k=f,y=o.length?o.map(x=>{const S=c[x.id]||{};return`<div class="pr-row">
          <span class="pr-id">${n(x.id)}</span>
          <span class="pr-t">${x.t}'</span>
          <span class="pr-rule">${S.ifCond?`若 ${n(S.ifCond.slice(0,24))} → ${n((S.thenAct||"").slice(0,30))}`:'<i class="pr-empty">未配规则</i>'}</span>
        </div>`}).join(""):'<div class="ar-empty">无 学情校准点 · 先到 S5 / S6 设规则</div>';return`
        <div class="figure-card rich-11 s8-view">
          <div class="fcard-lbl"><span>FIGURE · 复盘视图</span><b>S8 · 议程轨迹 + 学情触发摘要</b></div>

          <div class="ar-section">
            <div class="ar-head">
              <span>学生议程跨站兑现轨迹 (${s.length} 条)</span>
              <span class="ar-legend">S2 · S4 · S5 · S8</span>
            </div>
            <div class="ar-list">${k}</div>
          </div>

          <div class="ar-section pr-section">
            <div class="ar-head">
              <span>动态学情触发规则摘要 (${o.length} 个)</span>
            </div>
            <div class="pr-list">${y}</div>
          </div>

          <div class="figure-foot">
            <span>议程贯通 + 动态学情 闭环数据 · 来自 Store</span>
            <a href="#" data-demo-toast="完整复盘报告由「生成教学复盘报告」按钮产出">→ 见产物按钮</a>
          </div>
        </div>
      `}function Xe(){const e=W(11),t=[["低分样例",76,{status:"ok",source:"学生 SWOT 错例"}],["反馈语",68,{status:"ok",source:"5 类误区反馈模板"}],["修订案例",82,{status:"ok",source:"案例 v2"}],["课堂气氛",28,{status:"miss",source:"不可复用"}]],a=e&&e.bars&&e.bars.length?e.bars:t,s={ok:"var(--sage, #6a9a7b)",warn:"var(--amber, #d97757)",miss:"var(--mute-2, #c0c0c0)"},r=a.length,o=a.filter(c=>(c[2]||{}).status==="ok").length;return`
        <div class="figure-card rich-11 s9-view">
          <div class="fcard-lbl"><span>FIGURE · 资产价值</span><b>S9 · ${o}/${r} 类值得沉淀</b></div>
          <div class="evdensity-bars" style="padding-top:6px">
            ${a.map(c=>{const d=c[2]||{},g=s[d.status]||"var(--mute-2)",p=d.status==="ok"?"✓":d.status==="warn"?"⚠":"✕",f=d.source?`<small class="evd-source">${n(d.source)}</small>`:"";return`
                <div class="evd-row">
                  <span class="evd-lbl">${n(c[0])}${f}</span>
                  <span class="evd-track"><i style="width:${Math.max(0,Math.min(100,c[1])).toFixed(1)}%;background:${g}"></i></span>
                  <span class="evd-val" style="color:${g}">${c[1]} ${p}</span>
                </div>
              `}).join("")}
          </div>
          <div class="evd-callout">
            <b>★ 沉淀策略</b> · 保留 ok 状态 (${o} 类) · 修订 warn 状态 · 丢弃 miss 状态（如「课堂气氛」不可复用）
          </div>
          <div class="figure-foot">
            <span>来源 · 学期资产库 / 案例 v2 / 量规 v2 / 法规更新日志</span>
            <a href="#" data-demo-toast="点「生成下一轮改进计划」按钮 产出完整资产清单">→ 见产物按钮</a>
          </div>
        </div>
      `}function Se(e){const t=ce[e.id];return t?`
        <div class="agent-banner">
          <span class="agent-banner-meta">
            <span class="agent-banner-lbl">本节点协同 · LIVE</span>
            <span class="agent-banner-time">${n(t.time)} · Agent 提议</span>
          </span>
          <p class="agent-banner-body">${t.body}</p>
        </div>
      `:""}function Re(e){const t=X[e.id];if(!t)return"";const a=String(t.text).split(/，(.+)/),s=n(a[0]||t.text),r=n(a[1]||"");return`
        <a class="ext-cta" data-fanya data-fanya-url="${n(t.url)}" href="${n(t.url)}" target="_blank" rel="noopener noreferrer"
           aria-label="${n(t.text)} · 在新标签打开">
          <span class="ext-cta-rail" aria-hidden="true"></span>
          <span class="ext-cta-text">
            <b>${s}</b>${r?`，<em>${r}</em>`:""}
          </span>
          <span class="ext-cta-deco" aria-hidden="true">Story</span>
          <span class="ext-cta-btn" aria-hidden="true">▸</span>
        </a>
      `}function Je(e){const t=N[e.id]||[];return be(e,t)+Re(e)+K(e)+`<div class="core-grid">${ye(e)}${E(e,t)}</div>`+Se(e)+O(e,t)+z(e)}function He(e){const t=N[5]||[],a=W(5),s=D(5)&&D(5).exampleCase&&D(5).exampleCase.subject||"案例",r=a&&a.questionChain||[{lvl:1,type:"事实",text:"什么是 SWOT 四象限？"},{lvl:2,type:"机制",text:"什么算「内部」？什么算「外部」？"},{lvl:3,type:"证据",text:"每条 SWOT 必须配什么证据？"},{lvl:4,type:"权重",text:"列出 20 条后，哪 3 条最重要？"},{lvl:5,type:"应用",text:"SWOT 本身不产策略，TOWS 才产"},{lvl:6,type:"批判",text:"SWOT 工具本身有哪些局限？"}],o=a&&a.keyMisconceptions||[],c={low:"#3a8a4e",med:"#5a7090",high:"#b8860b","v.high":"#a8492a"},d={low:"低",med:"中",high:"高","v.high":"极高"},g=`
        <div class="figure-card">
          <div class="fcard-lbl">
            <span>FIGURE · 方法论严谨链</span>
            <b>${r.length} 层 × ${o.length} 类误区</b>
          </div>
          <div class="chain-rows">
            ${r.map(p=>{const f=Math.round((p.blocking||0)*100),k=c[p.difficulty]||"#999";return`
                <div class="chain-row">
                  <span class="cr-lvl" style="background:${k}">L${p.lvl}</span>
                  <span class="cr-type">${n(p.type)}</span>
                  <span class="cr-text">${n(p.text)}</span>
                  <span class="cr-meta">
                    ${p.difficulty?`<span class="cr-diff" style="color:${k}">${d[p.difficulty]||p.difficulty}</span>`:""}
                    ${p.blocking!==void 0?`<span class="cr-block" title="预计卡点率">卡 ${f}%</span>`:""}
                  </span>
                </div>
              `}).join("")}
          </div>
          ${o.length?`
            <details class="misc-disclosure" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--rule);">
              <summary style="cursor:pointer;font-family:var(--mono);font-size: var(--fs-2xs);color:var(--mute);letter-spacing:0.04em;list-style:none;">
                <span style="color:var(--amber-deep);font-weight:600;">⌄</span> 关键误区清单 · ${o.length} 类高频误区
              </summary>
              <ol class="qchain" style="margin-top:10px;">
                ${o.map(p=>{const f=Math.round((p.frequency||0)*100),k=f>=60?"fork":"";return`<li style="font-size: var(--fs-xs);">
                    ${n(p.text)}
                    <span class="ann ${k}">${f}% · ${n(p.stage||"")}</span>
                    ${p.intervention?`
                      <div style="margin-top:4px;padding:6px 9px;background:rgba(106,154,123,.08);border-left:2px solid var(--sage,#6a9a7b);font-size: var(--fs-2xs);color:var(--ink-soft,#3a3a3a);line-height:1.5;">
                        <span style="font-family:var(--mono);font-size: var(--fs-2xs);color:var(--sage,#6a9a7b);letter-spacing:.04em;">教学对策 · </span>${n(p.intervention)}
                      </div>
                    `:""}
                  </li>`}).join("")}
              </ol>
            </details>
          `:""}
        </div>
      `;return be(e,t)+K(e)+`<div class="core-grid">${g}${E(e,t)}</div>`+Se(e)+O(e,t)+z(e)}function Qe(e){const t=N[e.id]||[],a=W(1),s=a&&a.bars||[],r=[].concat(s).sort((y,x)=>x[1]-y[1]),o=r.length?r[0][1]:0,c=r.map(([y,x,S])=>{const L=S||{},P=x===o,j=L.status==="warn",G=P?"is-top":j?"is-warn":"is-ok",te=P?"推荐":j?"不建议":"备选",Q=y.replace(/(决策型|研究型|治理型|运营型)$/,"");return{name:y,short:Q,val:x,cls:G,statusLabel:te,source:L.source||"",breakdown:L.breakdown||[]}}),d=c.find(y=>y.cls==="is-top")||c[0],g=d?d.name:"综合决策型",p=d&&d.breakdown.length?d.breakdown.map(y=>({dim:y.dim,max:y.max})):[],f=p.map((y,x)=>c.map(S=>{const L=S.breakdown[x];return L?{score:L.score,max:L.max,note:L.note}:{score:0,max:p[x].max,note:""}})),k=`
        <div class="figure-card rich-01">
          <div class="fcard-lbl">
            <span>FIGURE · 课程对齐</span>
            <b>本节推荐定位 · ${n(g)}</b>
          </div>

          <!-- 对齐说明（替代三角图）-->
          <p class="alignment-note">
            本节课需对齐三件套:<b>药事·目标</b> ↔ <b>药事·任务</b> ↔ <b>药事·产出</b>。
            下方矩阵展示 4 类定位在 5 维评价上的分布——点击任一列查看细则。
          </p>

          <!-- 5×4 评分矩阵 -->
          <div class="rubric-matrix" data-current-col="${n(d?d.name:"")}">
            <!-- 表头行：corner + 4 类列 -->
            <div class="rm-corner">维度＼定位</div>
            ${c.map((y,x)=>`
              <button type="button" class="rm-col-h ${y.cls}${x===0?" is-current":""}" data-col-name="${n(y.name)}">
                <span class="rm-col-name">${n(y.short)}</span>
              </button>
            `).join("")}

            <!-- 5 维 × 4 类 矩阵 -->
            ${p.map((y,x)=>`
              <span class="rm-dim">${n(y.dim)}</span>
              ${f[x].map((S,L)=>{const P=(S.score/S.max*100).toFixed(0);return`<div class="rm-cell ${c[L].cls}" data-col-name="${n(c[L].name)}" title="${n(S.note||"")}">
                  <i class="rm-bar" style="width:${P}%"></i>
                  <span class="rm-num">${S.score}</span>
                </div>`}).join("")}
            `).join("")}

            <!-- 总分行 (推荐项通过 is-top 高亮 amber 背景传达,不再单独画状态行) -->
            <span class="rm-dim rm-dim-total">总分 / 100</span>
            ${c.map(y=>`<div class="rm-total ${y.cls}">${y.val}</div>`).join("")}
          </div>

          <!-- 详情区：默认显示 top 1（综合）,click 列切换 -->
          <div class="rm-detail">
            ${c.map((y,x)=>`
              <div class="rm-detail-pane ${y.cls}" data-pane-col="${n(y.name)}"${x===0?" data-active":""}>
                <div class="rm-detail-h">
                  <span>${n(y.name)} · 评分细则 (${y.val} / 100 · ${y.statusLabel})</span>
                  <small>${n(y.source)}</small>
                </div>
                <ul class="rm-detail-list">
                  ${y.breakdown.map(S=>`
                    <li>
                      <span class="rm-dt-dim">${n(S.dim)}</span>
                      <span class="rm-dt-val">${S.score}/${S.max}</span>
                      <span class="rm-dt-note">${n(S.note||"")}</span>
                    </li>
                  `).join("")}
                </ul>
              </div>
            `).join("")}
          </div>

        </div>
      `;return be(e,t)+K(e)+`<div class="core-grid">${k}${E(e,t)}</div>`+Se(e)+O(e,t)+z(e)}function Ve(e){const t=N[e.id]||[],a=W(3),s=a&&a.mockStudentResponses&&a.mockStudentResponses.clusters||[{agendaKey:"ethics-pricing",text:"伦理边界",studentVotes:11},{agendaKey:"innovation-press",text:"创新药企挤压",studentVotes:7},{agendaKey:"valsartan-trust",text:"信任修复",studentVotes:4},{agendaKey:"api-export",text:"出海前景",studentVotes:3},{agendaKey:"cdmo-window",text:"CDMO 机遇",studentVotes:3}],r=s.reduce((p,f)=>p+(f.studentVotes||0),0)||1,o=s.slice().sort((p,f)=>(f.studentVotes||0)-(p.studentVotes||0)),c=o[0],d=a&&a.mockStudentResponses&&a.mockStudentResponses.sampleCount||r,g=`
        <div class="figure-card rich-03">
          <div class="fcard-lbl"><span>FIGURE · 议程聚类</span><b>${s.length} 类 · ${r} 票 · N=${d}</b></div>
          <div class="agenda-cluster-wrap">
            ${o.map((p,f)=>{const k=(p.studentVotes||0)/r*100,y=f===0,x=(p.studentVotes||0)<=3,S=y?"var(--amber-deep)":x?"var(--mute-2)":"var(--amber)";return`
                <div class="agcl-row">
                  <span class="agcl-rank">${String(f+1).padStart(2,"0")}</span>
                  <span class="agcl-lbl">${n(p.text||p.agendaKey)}${y?" ★":""}</span>
                  <span class="agcl-bar"><i style="width:${k.toFixed(1)}%;background:${S}"></i></span>
                  <span class="agcl-val">${p.studentVotes||0} 票 · ${k.toFixed(0)}%</span>
                </div>
              `}).join("")}
          </div>
          <div class="tension-callouts">
            <div class="t-call"><b>${c.studentVotes}</b> 票 · ${n(c.text)} — 最高票议程，与教师预设最大张力点</div>
          </div>
          <div class="figure-foot">
            <span>来源 · 课前议程协商单 · ${d} 份学生回应</span>
            <details class="figure-drill"><summary>展开议程详情 →</summary>
              <ol class="drill-list">
                ${o.map(p=>`<li><b>${n(p.text||p.agendaKey)}</b> · ${p.studentVotes||0} 票（${((p.studentVotes||0)/r*100).toFixed(0)}%）${p.tensionWithTeacher?` <span class="drill-misc">张力：${n(p.tensionWithTeacher)}</span>`:""}</li>`).join("")}
              </ol>
            </details>
          </div>
        </div>
      `;return be(e,t)+K(e)+`<div class="core-grid">${g}${E(e,t)}</div>`+Se(e)+O(e,t)+z(e)}function Me(e){const t=N[e.id]||[],a=W(7),s=[{t:0,type:"phase",label:"导入"},{t:5,type:"anchor",anchorId:"Z1",label:"Z1"},{t:5,type:"phase",label:"概念支架"},{t:15,type:"phase",label:"案例分析"},{t:22,type:"anchor",anchorId:"Z2",label:"Z2"},{t:25,type:"phase",label:"小组协作"},{t:35,type:"phase",label:"反馈修正"},{t:38,type:"anchor",anchorId:"Z3",label:"Z3"},{t:42,type:"phase",label:"总结"},{t:45,type:"phase",label:"下课"}],r=[{id:"Z1",t:5,label:"导入末"},{id:"Z2",t:22,label:"案例分析中"},{id:"Z3",t:38,label:"反馈修正前"}],o=a&&a.timeline||s,c=a&&a.zpdAnchors||r,d=Math.max(...o.map(x=>x.t),1),g=o.filter(x=>x.type==="phase"),p=[],f=["#d9d9d9","#b8c5b0","#a8b9d4","var(--amber-soft)","var(--amber)","#c0c0c0"];for(let x=0;x<g.length-1;x++){const S=g[x],L=g[x+1],P=S.t/d*100,j=(L.t-S.t)/d*100;j<=.1||p.push({label:S.label,left:P,width:j,color:f[x%f.length]})}const k=[0,d/3,d*2/3,d].map(x=>Math.round(x)+"'"),y=`
        <div class="figure-card rich-07">
          <div class="fcard-lbl"><span>FIGURE · 课堂时间线</span><b>${d}' · ${c.length} 学情校准点</b></div>
          <div class="tl-wrap">
            <div class="tl-axis">
              ${k.map(x=>`<span>${n(x)}</span>`).join("")}
            </div>
            <div class="tl-bar">
              ${p.map((x,S)=>`
                <span class="tl-seg" style="left:${x.left.toFixed(2)}%;width:${x.width.toFixed(2)}%;background:${x.color}"><b>${n(x.label)}</b></span>
              `).join("")}
              ${c.map(x=>`<span class="tl-anchor" style="left:${(x.t/d*100).toFixed(2)}%" title="${n(x.id)} · ${x.t}'"><i>◇</i><small>${x.t}'</small></span>`).join("")}
            </div>
            <div class="tl-icap">
              <span class="icap-lbl">ICAP 参与层级 →</span>
              <span class="icap-bar">${p.map(x=>`<i style="left:${x.left.toFixed(2)}%;width:${x.width.toFixed(2)}%;background:${x.color}"></i>`).join("")}</span>
              <span class="icap-key"><b>P</b>assive <b>A</b>ctive <b>C</b>onstructive <b>I</b>nteractive</span>
            </div>
          </div>
          <div class="zpd-detail">
            ${c.map(x=>`
              <div class="zpd-row">
                <span class="zpd-num">◇ ${n(x.id)}</span>
                <span class="zpd-t">${String(x.t).padStart(2,"0")}'</span>
                <span class="zpd-when">${n(x.label||"")}${x.format?" · "+n(x.format):""}</span>
                <span class="zpd-rule">→ 在课中调控环节设规则</span>
              </div>
            `).join("")}
          </div>
          <div class="figure-foot">
            <span>动态学情触发 · 任务链环节定义 · 课中调控环节落地</span>
            <a href="#" data-demo-toast="锚点编辑器在课中调控环节完成">去课中调控环节编辑规则 →</a>
          </div>
        </div>
      `;return be(e,t)+K(e)+`<div class="core-grid">${y}${E(e,t)}</div>`+Se(e)+O(e,t)+z(e)}function et(e){const t=(J[e.id]||{}).cn||"station",a={1:"positioning.md",2:"learner-profile.md",3:"agenda.md",4:"objectives.md",5:"question-chain.md",6:"case-evidence.md",7:"lesson-timeline.md",8:"collab-tasks.md",9:"trigger-rules.md",10:"rubric.md",11:"retrospective.md"},s=_();return s==="2-3"&&(e.id===2||e.id===3)?"learner-profile-and-agenda.md":s==="1b"&&e.id===1?"positioning.locked.md":s==="1"&&e.id===1?"positioning.md":e.id===9&&s&&/^9-z[1-3]$/.test(s)?`trigger-rules.${s.slice(-2).toUpperCase().toLowerCase()}.md`:e.id===4&&s==="4-a"?"learning-objectives.md":e.id===4&&s==="4-b"?"rubric.md":e.id===7&&s==="7"?"lesson-timeline.md":e.id===7&&s==="7b"?"lesson-timeline.locked.md":e.id===10&&s==="10-a"?"rubric-scores.md":e.id===10&&s==="10-b"?"feedback-and-profile.md":e.id===10&&s==="10-c"?"rubric-revision-proposal.md":a[e.id]||`${t}.md`}function ot(){const e=document.getElementById("rightRail");e&&(e.innerHTML="")}function ct(){const e=document.getElementById("saveStrip");if(!e)return;const t=l[H];if(!t)return;const a=et(t),s=fe(),r=I[s],o=(r&&r.subNodeIds||[]).map(String);let c=pe;c||(c=o.find(x=>{const S=u[x]||{};return(typeof S.legacyStationId=="number"?S.legacyStationId:Number(x))===H})||null);const d=c?o.indexOf(String(c)):-1;let g="已是最后一环节",p=null,f=null,k=null;if(d>=0&&d<o.length-1)f=o[d+1],p=(u[f]||{}).legacyStationId,k=s,g=`下一步 · 步骤 ${d+2} / ${o.length} →`;else{const x=w.findIndex(S=>S.id===s);if(x>=0&&x<w.length-1){const S=w[x+1];f=(S.subNodeIds||[]).map(String)[0],p=(u[f]||{}).legacyStationId,k=S.id,g=`下一环节 · ${ue(x+2)} ${S.displayName} →`}}const y=p?` onclick="window.__navSetStation(${p}, '${n(k||"")}', '${n(String(f||""))}')"`:" disabled";e.innerHTML=`
        <span>已自动保存 · <b>${H===5?"2 分钟前":"未开始"}</b> · ${n(a)}${H===5?" v0.2":""}</span>
        <div class="save-actions">
          <button class="btn-s" data-demo-download data-plan-name="${n(a)}">⤓ 导出 ${n(a)}</button>
          <button class="btn-s" data-writeback-map data-station="${H}">＋ 写回训练地图</button>
          <button class="btn-s fill"${y}>${n(g)}</button>
        </div>
      `}function lt(){document.addEventListener("click",e=>{const t=e.target.closest("[data-st]");if(!t)return;const a=Number(t.getAttribute("data-st"));if(!Number.isFinite(a))return;const s=t.getAttribute("data-subkey"),r=t.getAttribute("data-stage-hint")||(s&&u[s]?u[s].stageId:null);Ue(a,r,s)}),document.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const t=e.target.closest(".chain-q-opts li[data-opt-key], [data-stage][role='button'], .sc-theory[data-theory-stage]");if(t){e.preventDefault(),t.click();return}const a=e.target.closest("[data-st]");if(!a)return;e.preventDefault();const s=Number(a.getAttribute("data-st"));if(!Number.isFinite(s))return;const r=a.getAttribute("data-subkey"),o=a.getAttribute("data-stage-hint")||(r&&u[r]?u[r].stageId:null);Ue(s,o,r)})}function Ue(e,t,a,s){if(!(!l[e]||!(e!==H)&&!(t&&t!==ge)&&!(a!==void 0&&a!==pe))){H=e,ge=t||null,a!==void 0?pe=a||null:pe=null;try{window.PharmacoPilotStore&&window.PharmacoPilotStore.setActiveStation&&window.PharmacoPilotStore.setActiveStation(e)}catch{}if(tt(),s&&s.scrollToWorkbench){const d=document.querySelector(".wb");d&&d.scrollIntoView({behavior:"smooth",block:"start"})}}}window.__navSetStation=function(e,t,a){Ue(e,t||null,a,{scrollToWorkbench:!0})},window.__navRenderState={currentStageId:()=>fe(),currentStation:()=>H,activeStageOverride:()=>ge,currentSubKey:()=>_(),refreshStageVisuals:()=>{try{nt(),at(),it(),Ge()}catch{}},refreshDetail:()=>{try{he(),Ge()}catch{}}};function tt(){de(),nt(),it(),Ge(),at(),Be(),he(),ot(),ct()}function at(){const e=document.querySelector(".stage-deck-v4 .stage-row");if(!e)return;const t=w.findIndex(a=>a.id===fe());[{id:"pre",cls:"s-pre"},{id:"in",cls:"s-in"},{id:"post",cls:"s-post"}].forEach(a=>{const s=e.querySelector("."+a.cls);if(!s)return;const r=w.filter(x=>x.phase===a.id),o=r.length,c=r.filter(x=>Fe(x.id)==="is-done").length,d=t<0?0:r.filter(x=>w.findIndex(S=>S.id===x.id)<=t).length,g=r.find(x=>x.id===fe()),p=o>0&&c===o;s.classList.toggle("is-phase-done",p),s.classList.toggle("is-phase-active",!!g&&!p);let f=s.querySelector(".seg-progress");f||(f=document.createElement("span"),f.className="seg-progress",s.insertBefore(f,s.firstChild));const k=o>0?Math.round(d/o*100):0;f.style.width=k+"%";let y=s.querySelector(".seg-progress-txt");y||(y=document.createElement("span"),y.className="seg-progress-txt",s.appendChild(y)),y.innerHTML=p?`<i class="seg-check">✓</i> ${c}/${o}`:`${d}/${o}`})}function fe(){return ge&&I[ge]?ge:M(H)||w[0]&&w[0].id}function Fe(e){const t=I[e];if(!t)return"";if(e===fe())return"is-active";const a=window.PharmacoPilotStore,s=(t.subNodeIds||[]).map(String);if(!s.length)return"";if(a&&a.getJudgment)return s.every(d=>{const g=u[d]||{},p=typeof g.legacyStationId=="number"?g.legacyStationId:Number(d);return Number.isFinite(p)&&a.getJudgment(p)})?"is-done":"";const r=(t.subNodeIds||[]).filter(c=>typeof c=="number");return r.length&&r.every(c=>c<H)?"is-done":""}function dt(e){const t=window.PharmacoPilotStore;if(!t||!t.getJudgment)return!0;const a=I[e];return a?(a.subNodeIds||[]).map(String).some(s=>{const r=u[s]||{},o=typeof r.legacyStationId=="number"?r.legacyStationId:Number(s);return!!(t.getJudgment(s)||Number.isFinite(o)&&t.getJudgment(o))}):!0}function pt(e){const t=F[e];return!t||!t.inputsFrom||!t.inputsFrom.length?[]:t.inputsFrom.filter(a=>!dt(a)).map(a=>{const s=I[a]||{},r=F[a]||{},o=w.findIndex(c=>c.id===a)+1;return{id:a,idx:o,name:s.displayName||s.title||a,products:r.topCardToKeys||[]}})}function rt(e){const t=u[e];if(!t||!t.enterCondition||!t.enterCondition.requires)return null;const a=window.PharmacoPilotStore;if(!a||!a.getJudgment)return null;const s=t.enterCondition.requires.filter(r=>r.subKey?!a.getJudgment(r.subKey):r.stationId!=null?!a.getJudgment(r.stationId):!1);return s.length?{unmet:s,reason:s.map(r=>r.reason).filter(Boolean)}:null}function ut(){const e=fe(),t=typeof _=="function"?_():null,a=pt(e),s=t?rt(t):null;return{blocked:a.length>0||!!s,missing:a,subUnmet:s}}function mt(e){if(!e||!e.blocked)return"";let t="";if(e.missing.length){const a=e.missing.map(s=>`
          <div class="eg-row">
            <button class="eg-go" type="button" data-stage="${n(s.id)}">去完成 ${ue(s.idx)} ${n(s.name)}</button>
            <span class="eg-prod">缺：${n((s.products||[]).join(" / ")||"上游产物")}</span>
          </div>`).join("");t+=`
          <div class="evidence-gate">
            <div class="eg-h">缺少上游证据 · 本环节可浏览，但暂不能拍板保存</div>
            <div class="eg-note">没有这些上游产物，这里的判断会退化成"模板填写"。请先补齐：</div>
            <div class="eg-list">${a}</div>
          </div>`}return e.subUnmet&&(t+=`
          <div class="evidence-gate eg-sub">
            <div class="eg-h">本步是「回写 / 再修订」节点 · 需先完成前置</div>
            <div>${n((e.subUnmet.reason||[]).join("；")||"请先完成前置子节点，再做回写")}</div>
          </div>`),t}function nt(){const e=document.getElementById("stageChips");if(e){if(!w.length){e.innerHTML='<div class="stage-chip" style="grid-column:1/-1;text-align:center;color:var(--mute-2)">contract.NAV_STAGES 未加载</div>';return}e.innerHTML=w.map((t,a)=>{const s=w[a+1],r=!s,o=s&&s.phase!==t.phase,c=["stage-chip",Fe(t.id),r?"is-last":"",o?"is-cross-phase":""].filter(Boolean).join(" "),d=(t.subNodeIds||[]).length,g=String(a+1).padStart(2,"0"),p=t.theoryDrawer&&t.theoryDrawer.length>0,f=Fe(t.id)==="is-done";return`<div class="${c}" data-stage="${n(t.id)}" data-phase="${n(t.phase)}" role="button" tabindex="0">
          <span class="sc-num">${g}</span>
          <span class="sc-cn">${n(t.displayName||t.title)}</span>
          ${d>1?`<span class="sc-sub-count">${d}</span>`:""}
          ${p?`<span class="sc-theory" data-theory-stage="${n(t.id)}" title="方法依据 · ${n(t.theoryDrawer.length)} 条" role="button" tabindex="0" aria-label="查看方法依据">方</span>`:""}
          ${f?'<span class="sc-done-mark" aria-label="已完成">✓</span>':""}
        </div>`}).join("")}}function ft(e,t){const a=I[e];if(!a||!a.theoryDrawer||!a.theoryDrawer.length)return;let s=document.getElementById("ppl-theory-popover");s||(s=document.createElement("div"),s.id="ppl-theory-popover",document.body.appendChild(s)),s.innerHTML=`
        <div class="pt-title">方法依据 · ${n(a.tag||"")}</div>
        <div class="pt-stage">${n(a.title)}</div>
        <div class="pt-tags">
          ${a.theoryDrawer.map(g=>`<span class="pt-tag">${n(g)}</span>`).join("")}
        </div>
        <div class="pt-foot">${a.theoryDrawer.length} 条理论支撑</div>
      `;const r=t.getBoundingClientRect();s.style.display="block";const o=280;let c=window.scrollX+r.left+r.width/2-o/2;const d=window.scrollX+window.innerWidth-o-12;c>d&&(c=d),c<window.scrollX+12&&(c=window.scrollX+12),s.style.left=c+"px",s.style.top=window.scrollY+r.bottom+8+"px"}function st(){const e=document.getElementById("ppl-theory-popover");e&&(e.style.display="none")}document.addEventListener("click",e=>{const t=e.target.closest("[data-theory-stage]");if(t){e.preventDefault(),e.stopPropagation(),ft(t.getAttribute("data-theory-stage"),t);return}e.target.closest("#ppl-theory-popover")||st()}),document.addEventListener("keydown",e=>{e.key==="Escape"&&st()});function it(){const e=document.getElementById("stageBreadcrumb");if(!e)return;const t=fe(),a=I[t];if(!a){e.innerHTML="";return}let s=u[String(H)];const o=(a.subNodeIds||[]).map(String).find(p=>{const f=u[p];return f&&f.legacyStationId===H&&/[a-z]$/i.test(p)});o&&(s=u[o]);const c=a.title||a.displayName,d=s?s.subTitle:"";let g="";["pre","in","post"].forEach((p,f)=>{const k=w.filter(x=>x.phase===p),y=k.map(x=>{const S=x.id===t,L=Fe(x.id)==="is-done";return`<span class="${["mm-dot",S?"is-active":"",L?"is-done":""].filter(Boolean).join(" ")}" data-stage="${n(x.id)}" title="${n(x.tag||"")} · ${n(x.title)}"></span>`}).join("");g+=`<span class="mm-phase mm-phase-${p}" data-phase-len="${k.length}">${y}</span>`,f<2&&(g+='<span class="mm-gap"></span>')}),e.innerHTML=`
        <span class="bc-stage">${n(a.tag||"")} · ${n(c)}</span>
        <span class="bc-sep">›</span>
        <span class="bc-sub">${n(d||"子节点 "+H)}</span>
        ${a.keyDecision?`<span class="bc-decision">${n(a.keyDecision)}</span>`:""}
        <span class="bc-minimap" aria-label="9 个教学环节进度小地图">${g}</span>
      `}function Ge(){const e=document.getElementById("stationTiles");if(!e)return;const t=I[fe()];if(!t){e.innerHTML="";return}const a=(t.subNodeIds||[]).map(p=>String(p));if(!a.length){e.classList.add("is-empty"),e.innerHTML="本环节暂无子节点";return}e.classList.remove("is-empty");const s=t.id,r=w.findIndex(p=>p.id===s)+1,o=ue(r),c=a.length>1,d=pe||a.find(p=>{const f=u[p]||{};return(typeof f.legacyStationId=="number"?f.legacyStationId:Number(p))===H})||null,g=window.PharmacoPilotStore;e.innerHTML=a.map((p,f)=>{const k=u[p]||{},y=k.legacyStationId||Number(p)||H,x=p===d,S=xe(y)==="is-done"?"is-done":"",L=g&&typeof g.getJudgment=="function"?!!(g.getJudgment(p)||a.length===1&&g.getJudgment(y)):!1,P=rt(p),j=!L&&!!P,G=j?P.reason&&P.reason[0]||"需先完成前置子节点":"",te=["tile",S,x?"is-active":"",L?"is-saved":"",j?"is-locked":""].filter(Boolean).join(" "),Q=String.fromCharCode(97+f),le=c?`${o}·${Q}`:o,oe=L?'<span class="t-check" aria-label="已保存">✓</span>':j?'<span class="t-lock" aria-label="前置未完成">🔒</span>':"";return`<div class="${te}" data-st="${y}" data-subkey="${n(p)}" data-stage-hint="${n(s)}" role="button" tabindex="0"${G?` title="${n(G)}"`:""}>
          <span class="t-num">${le}</span>
          <span class="t-cn">${n(k.subTitle||"")}</span>
          ${oe}
        </div>`}).join("")}document.addEventListener("click",e=>{const t=e.target.closest("[data-stage]");if(!t)return;const a=t.getAttribute("data-stage"),s=I[a];if(!s||!s.subNodeIds||!s.subNodeIds.length)return;const r=s.subNodeIds[0],o=typeof r=="number"?r:(u[String(r)]||{}).legacyStationId;Number.isFinite(o)&&l[o]&&Ue(o,a)});function gt(){const e=window.PharmacoPilotStore;if(!e)return;const t=function(){return window.PharmacoPilotSampleCollection};document.addEventListener("click",r=>{const o=r.target.closest(".chain-q-opts li[data-opt-key]");if(!o||o.classList.contains("is-locked"))return;const c=o.closest(".chain-q"),d=o.closest(".question-card.chain-mode");if(!d)return;const g=Number(d.getAttribute("data-chain-station")||H),p=Number(c.getAttribute("data-step")),f=o.getAttribute("data-opt-key"),k=o.getAttribute("data-correct")==="1",y=t();if(y&&y.trackStepEntered&&y.trackStepEntered(g,p),y&&y.trackChoice&&y.trackChoice(g,p,f,k),k){const x=Math.min(p+1,3);e.setChainStep(g,x,{["q"+p+"Done"]:!0}),typeof window.showDemoToast=="function"&&window.showDemoToast(p>=3?"✓ 答对了 · 本题链已完成":"✓ 答对了 · 已解锁下一题")}else{const x=c.querySelector(".chain-hint-drawer"),S=x?x.querySelectorAll(".chain-hint-item").length:0,L=Math.min(S+1,4);y&&y.trackHintRevealed&&y.trackHintRevealed(g,p,L),setTimeout(()=>{const P=document.querySelector(`.chain-q[data-step="${p}"] .chain-hint-drawer`);if(!P)return;const j=P.parentElement.querySelector(".chain-wrong-toast");j&&j.remove();const G=document.createElement("div");G.className="chain-wrong-toast",G.setAttribute("role","status"),G.setAttribute("aria-live","assertive"),G.innerHTML="<span>✕</span> <span>再想想 — 下方已展开一条新视角提示 ↓</span>",P.parentElement.insertBefore(G,P),setTimeout(()=>{G.classList.add("is-fading"),setTimeout(()=>{try{G.remove()}catch{}},320)},2500)},100)}he()}),document.addEventListener("click",r=>{const o=r.target.closest(".rm-col-h[data-col-name], .rm-cell[data-col-name]");if(!o)return;const c=o.closest(".figure-card.rich-01");if(!c)return;const d=o.getAttribute("data-col-name");c.querySelectorAll(".rm-detail-pane").forEach(k=>k.removeAttribute("data-active"));const g=c.querySelector('.rm-detail-pane[data-pane-col="'+d.replace(/"/g,'\\"')+'"]');g&&g.setAttribute("data-active",""),c.querySelectorAll(".rm-col-h").forEach(k=>k.classList.remove("is-current"));const p=c.querySelector('.rm-col-h[data-col-name="'+d.replace(/"/g,'\\"')+'"]');p&&p.classList.add("is-current");const f=c.querySelector(".rubric-matrix");f&&f.setAttribute("data-current-col",d)}),document.addEventListener("click",r=>{const o=r.target.closest(".btn-hint[data-hint-station]");if(!o||o.disabled)return;const c=Number(o.getAttribute("data-hint-station")),d=Number(o.getAttribute("data-hint-step")),g=document.querySelector('.chain-hint-drawer[data-drawer-step="'+d+'"]'),p=g?g.querySelectorAll(".chain-hint-item").length:0,f=Math.min(p+1,4),k=t();k&&k.trackHintRevealed&&k.trackHintRevealed(c,d,f),he()}),document.addEventListener("click",r=>{const o=r.target.closest("button[data-save-reflection]");if(!o||o.disabled)return;const c=o.closest('[data-chain-card="reflection"]')||o.closest(".chain-card");if(!c)return;const d=Number(c.getAttribute("data-station")),g=c.getAttribute("data-field"),p=c.querySelector("textarea[data-reflection-input]"),f=p?p.value.trim():"";if(!f){const k=c.querySelector(".chain-meta");k&&(k.style.color="var(--amber-deep)",k.textContent="请先写下你的理由");return}e.saveChainReflection(d,g,f),he()}),document.addEventListener("click",r=>{const o=r.target.closest("button[data-skip-transfer]");if(!o||o.disabled)return;const c=o.closest('[data-chain-card="transfer"]');if(!c)return;const d=Number(c.getAttribute("data-station"));e.skipTransfer(d),he()}),document.addEventListener("click",r=>{const o=r.target.closest("[data-reset-chain]");if(!o)return;const c=Number(o.getAttribute("data-reset-chain"));confirm("确定要重置本节点的所有答题进度吗?(读图、诊断、决策、反思、迁移都会清空)")&&(e.resetChainProgress(c),he())});function a(r){r&&(document.querySelectorAll(".rm-col-h[data-col-name],.rm-cell[data-col-name]").forEach(o=>{o.getAttribute("data-col-name")===r&&o.classList.add("is-hover-linked")}),document.querySelectorAll(".chain-q-opts li[data-link-col]").forEach(o=>{o.getAttribute("data-link-col")===r&&o.classList.add("is-hover-linked")}))}function s(r){document.querySelectorAll(".is-hover-linked").forEach(o=>{(!r||o.getAttribute("data-col-name")===r||o.getAttribute("data-link-col")===r)&&o.classList.remove("is-hover-linked")})}document.addEventListener("mouseover",r=>{if(!r.target.closest)return;const o=r.target.closest(".chain-q-opts li[data-link-col]");if(o){a(o.getAttribute("data-link-col"));return}const c=r.target.closest(".rm-col-h[data-col-name], .rm-cell[data-col-name]");c&&a(c.getAttribute("data-col-name"))}),document.addEventListener("mouseout",r=>{if(!r.target.closest)return;const o=r.target.closest(".chain-q-opts li[data-link-col]");if(o){s(o.getAttribute("data-link-col"));return}const c=r.target.closest(".rm-col-h[data-col-name], .rm-cell[data-col-name]");c&&s(c.getAttribute("data-col-name"))}),document.addEventListener("click",r=>{const o=r.target.closest("button[data-save-transfer]");if(!o||o.disabled)return;const c=o.closest('[data-chain-card="transfer"]')||o.closest(".chain-card");if(!c)return;const d=Number(c.getAttribute("data-station")),g=c.getAttribute("data-axis"),p=c.querySelector("textarea[data-transfer-input]"),f=p?p.value.trim():"";if(!f){const y=c.querySelector(".chain-meta");y&&(y.style.color="var(--amber-deep)",y.textContent="请先写下你的迁移判断");return}const k=t();k&&k.trackTransferSubmit?k.trackTransferSubmit(d,f,g):e.saveTransfer(d,f,g),he()}),e.on("transfer:saved",function(r){!r||!r.stationId||setTimeout(function(){he()},60)}),e.on("judgment:saved",function(r){if(!r||!r.stationId||!ke(r.stationId))return;const c=e.getChainProgress(r.stationId);e.setChainStep(r.stationId,Math.max(c.currentStep||1,3),{q3Done:!0});const d=t();d&&d.showConsentCard&&!e.getConsent().enabled&&setTimeout(function(){d.showConsentCard()},420),setTimeout(function(){he()},80)})}try{window.PharmacoPilotStore&&window.PharmacoPilotStore.setActiveStation&&window.PharmacoPilotStore.setActiveStation(H)}catch{}tt(),lt(),gt()})}(),function(){"use strict";function Y(l){const w=l.querySelector("#theoryAddBtn")||document.getElementById("theoryAddBtn"),u=l.querySelector("#theoryAddPanel")||document.getElementById("theoryAddPanel"),F=l.querySelector("#theoryAddForm")||document.getElementById("theoryAddForm"),I=l.querySelector("#theoryAddCancel")||document.getElementById("theoryAddCancel");if(!w||!u||!F)return;const A=l.dataset.storeKey||"pp.theoryAdds.default",q=A+".hidden",M=F.querySelector(".submit"),_=F.elements.title,D=F.elements.source;function W(){try{return JSON.parse(localStorage.getItem(A)||"[]")}catch{return[]}}function R(U){localStorage.setItem(A,JSON.stringify(U))}function J(U){const V=document.createElement("span");if(V.className="theory-chip is-custom",V.dataset.id=U.id,V.appendChild(document.createTextNode(U.title+(U.source?" ":""))),U.source){const de=document.createElement("small");de.textContent=U.source,V.appendChild(de)}const re=ue("移除",()=>{R(W().filter(de=>de.id!==U.id)),V.remove()});return V.appendChild(re),V}function X(){l.querySelectorAll(".theory-chip.is-custom").forEach(U=>U.remove()),W().forEach(U=>l.insertBefore(J(U),w))}function ce(){try{return new Set(JSON.parse(localStorage.getItem(q)||"[]"))}catch{return new Set}}function ve(U){localStorage.setItem(q,JSON.stringify([...U]))}function H(U){return(U.textContent||"").replace(/\s+/g," ").replace("×","").trim()}function ge(U){U.classList.contains("is-custom")||U.querySelector(".x")||U.appendChild(ue("隐藏此引用",()=>{const V=H(U),re=ce();re.add(V),ve(re),U.style.transition="opacity .2s, transform .2s",U.style.opacity="0",U.style.transform="scale(.85)",setTimeout(()=>U.remove(),220)}))}function pe(){const U=ce();l.querySelectorAll(".theory-chip:not(.is-custom)").forEach(V=>{U.has(H(V))?V.remove():ge(V)})}function ue(U,V){const re=document.createElement("button");return re.type="button",re.className="x",re.setAttribute("aria-label",U),re.title=U,re.textContent="×",re.addEventListener("click",de=>{de.stopPropagation(),V()}),re}function n(){u.classList.add("is-open"),w.classList.add("is-open"),w.setAttribute("aria-expanded","true"),setTimeout(()=>_&&_.focus(),50)}function xe(){u.classList.remove("is-open"),w.classList.remove("is-open"),w.setAttribute("aria-expanded","false"),F.reset(),M&&(M.disabled=!0)}w.addEventListener("click",()=>{u.classList.contains("is-open")?xe():n()}),I&&I.addEventListener("click",xe),_&&M&&_.addEventListener("input",()=>{M.disabled=!_.value.trim()}),F.addEventListener("submit",U=>{U.preventDefault();const V=(_&&_.value||"").trim();if(!V)return;const re={id:"c"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),title:V,source:(D&&D.value||"").trim()},de=W();de.push(re),R(de),l.insertBefore(J(re),w),xe()}),document.addEventListener("keydown",U=>{U.key==="Escape"&&u.classList.contains("is-open")&&xe()}),pe(),X(),N(l,w)}const h=6;function B(){if(document.getElementById("theory-collapse-css"))return;const l=document.createElement("style");l.id="theory-collapse-css",l.textContent=".theory-row.is-collapsed .theory-chip.thy-overflow{display:none;}.theory-toggle{font-family:var(--mono);font-weight:500;letter-spacing:0.04em;cursor:pointer;border:1px dashed var(--line,#d8d2c4);background:transparent;color:var(--mute,#8a8478);border-radius:999px;padding:3px 10px;font-size: var(--fs-2xs);line-height:1.4;white-space:nowrap;}.theory-toggle:hover{color:var(--ink,#1a1714);border-color:var(--ink,#1a1714);}",document.head.appendChild(l)}function N(l,w){if(l.dataset.theoryCollapseBound==="1")return;const u=[...l.querySelectorAll(".theory-chip:not(.is-custom)")],F=l.dataset.theoryLimit!=null&&l.dataset.theoryLimit!==""?Math.max(0,parseInt(l.dataset.theoryLimit,10)||0):h;if(u.length<=F)return;l.dataset.theoryCollapseBound="1",B(),u.slice(F).forEach(q=>q.classList.add("thy-overflow")),l.classList.add("is-collapsed");const I=document.createElement("button");I.type="button",I.className="theory-toggle";const A=()=>{const q=l.classList.contains("is-collapsed");I.textContent=q?`+${u.length-F} 更多理论依据 ▾`:"收起理论依据 ▴",I.setAttribute("aria-expanded",String(!q))};I.addEventListener("click",()=>{l.classList.toggle("is-collapsed"),A()}),l.insertBefore(I,w||null),A()}function v(){document.querySelectorAll(".theory-row").forEach(l=>{l.dataset.theoryChipsBound!=="1"&&(!l.querySelector("#theoryAddBtn")&&!document.getElementById("theoryAddBtn")||(l.dataset.theoryChipsBound="1",Y(l)))})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",v):v()}(),function(h){"use strict";function B(N){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",N):N()}B(function(){const v=h.PharmacoPilotStore,l=h.PharmacoPilotDecisionBank,w=h.PharmacoPilotStationPayloads||{};if(!v){console.warn("[bridge] Store missing");return}if(!l){console.warn("[bridge] DecisionBank missing");return}if(v.getAgendas().length===0){const i=w[3],m=w[6];if(i&&i.evidenceFigure&&i.evidenceFigure.mockStudentResponses){const T=i.evidenceFigure.mockStudentResponses.clusters||[];v.setAgendas(T.map($=>({key:$.agendaKey,text:$.text,votes:$.studentVotes,sourceStation:3})))}else if(m&&m.evidenceFigure){const T=m.evidenceFigure.agendaCoverageDots||[];v.setAgendas(T.map($=>({key:$.agendaKey,text:$.label,evidenceSrc:$.evidenceSrc,preFulfilled:$.covered}))),T.filter($=>$.covered).forEach($=>{v.markAgendaFulfilled(6,$.agendaKey,$.evidenceSrc)})}}let u=v.getActiveStation()||1;v.on("active:changed",function(i){i&&Number.isFinite(i.id)&&(u=i.id,setTimeout(be,60))}),document.addEventListener("click",i=>{const m=i.target.closest("[data-st][role='button']");if(m){const $=parseInt(m.getAttribute("data-st"),10);if(!isNaN($)){u=$,v.setActiveStation($),setTimeout(be,60);return}}const T=i.target.closest("[data-stage]");if(T){const $=T.getAttribute("data-stage"),C=h.PharmacoPilotNavigationContract,E=C&&C.NAV_STAGES||[],O=C&&C.SUB_NODES||{},z=E.find(K=>K.id===$);if(z&&z.subNodeIds&&z.subNodeIds.length){const K=z.subNodeIds[0],ne=typeof K=="number"?K:(O[String(K)]||{}).legacyStationId;Number.isFinite(ne)&&(u=ne)}setTimeout(be,80)}});let F=null;function I(i){document.querySelectorAll(".decision-dock .dd-opt").forEach(T=>{T.classList.toggle("is-selected",T.getAttribute("data-key")===i)}),document.querySelectorAll(".qchain.qchain-rich li").forEach(T=>{T.classList.toggle("is-selected",T.getAttribute("data-key")===i)});const m=document.querySelector(".decision-dock .btn-s.fill");m&&!m.classList.contains("is-saved")&&(m.disabled=!1,m.removeAttribute("aria-disabled"))}function A(){try{const i=v.getActiveStation&&v.getActiveStation();if(Number.isFinite(i))return i}catch{}return u}document.addEventListener("click",i=>{const m=i.target.closest(".decision-dock .btn-s");if(!m||m.classList.contains("fill")||m.hasAttribute("data-artifact-id"))return;const T=A(),$=l[T]||[],C=m.getAttribute("data-key"),E=C?$.find(z=>z[0]===C):null;if(!E){console.error("[bridge] 选项无法匹配决策库:station",T,"data-key =",C,"文案 =",(m.textContent||"").trim().slice(0,20));return}const O=E[4]||{};if(F={stationId:T,key:E[0],score:E[3],label:E[1],meta:O},O.blockSave)m.setAttribute("data-demo-toast","✕ 此选项违反禁条 · 已阻止保存");else{const z=O.recommended?" · 推荐项":"",K=E[1].length>18?E[1].slice(0,18)+"…":E[1];m.setAttribute("data-demo-toast",`已暂存「${K}」${z} · 点保存判断落库`),I(E[0])}},!0),document.addEventListener("click",i=>{const m=i.target.closest(".decision-dock .btn-s.fill");if(!m)return;if(!F){m.setAttribute("data-demo-toast","请先选择一个判断选项");return}if(F.meta&&F.meta.blockSave){m.setAttribute("data-demo-toast","✕ 当前暂存选项违反禁条 · 请重选");return}const T=h.__navRenderState&&h.__navRenderState.currentSubKey?h.__navRenderState.currentSubKey():null;v.saveJudgment(F.stationId,F.key,F.score,F.label,T);let $="";if(T==="10-c"&&v.proposeRubricRevision){const O=F.label||F.key,z=(O.match(/(一致性|真实性|学情|高阶|评价|批判意识)/)||[])[0]||"未指明维度",K=v.proposeRubricRevision({dim:z,reason:`S7 评分发现：${O}`,proposedChange:`根据本轮学生作品的 ${z} 维度评分分布，建议在 S2·02-b 重新审视该维度的描述符或权重。`,evidenceArtifactId:`rubric-revision-proposal.md@${Date.now()}`});K&&K.ok&&($=` · ↩ 已向 S2 提交反向修订（待审 ${v.getRubricRevisions("pending").length} 条）`)}const C=v.getProgress(),E=T?` · ${T}`:"";m.setAttribute("data-demo-toast",`✓ 节点 ${qe(F.stationId)}${E} 判断已落库「${F.key}」 · 进度 ${C.done}/${C.total}${$}`),m.textContent="已保存判断 ✓",m.disabled=!0,m.classList.add("is-saved"),m.setAttribute("aria-disabled","true"),F=null},!0);function q(){const i=h.PharmacoPilotNavigationContract,m=i&&i.NAV_STAGES||[],T=i&&i.SUB_NODES||{};if(!m.length)return null;const $=v.dump().judgments||{};return{done:m.filter(E=>{const O=(E.subNodeIds||[]).filter(z=>typeof z=="number"||T[String(z)]&&T[String(z)].legacyStationId);return O.length?O.every(z=>{const K=typeof z=="number"?z:T[String(z)].legacyStationId;return $[K]}):!1}).length,total:m.length}}function M(){const i=v.getProgress(),m=q(),T=["sc-num","t-num","n","zpd-num"];document.querySelectorAll("*").forEach($=>{if($.children.length!==0||T.some(E=>$.classList&&$.classList.contains(E)))return;const C=$.textContent&&$.textContent.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);C&&(C[2]==="11"?$.textContent=`${i.done} / ${i.total}`:C[2]==="9"&&m&&($.textContent=`${m.done} / ${m.total}`))}),Object.keys(v.dump().judgments).forEach($=>{const C=document.querySelector(`[data-st="${$}"][role="button"]`);C&&!C.classList.contains("is-active")&&C.classList.add("is-done")}),h.__navRenderState&&h.__navRenderState.refreshStageVisuals&&h.__navRenderState.refreshStageVisuals()}v.on("judgment:saved",M),v.on("store:reset",M),setTimeout(M,80);function _(){h.__navRenderState&&h.__navRenderState.refreshDetail&&h.__navRenderState.refreshDetail()}v.on("rubric:revisionProposed",_),v.on("rubric:revisionResolved",_);function D(){if(document.getElementById("ppl-bridge-styles"))return;const i=document.createElement("style");i.id="ppl-bridge-styles",i.textContent=`
        /* === G · Settings 抽屉 === */
        #ppl-settings-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.32);
          opacity: 0; pointer-events: none; transition: opacity .25s;
          z-index: 90;
        }
        #ppl-settings-overlay.is-open { opacity: 1; pointer-events: auto; }
        #ppl-settings-drawer {
          position: fixed; top: 0; right: 0; height: 100vh; width: 360px;
          max-width: 90vw; background: #faf6ee; box-shadow: -8px 0 24px rgba(0,0,0,.18);
          transform: translateX(100%); transition: transform .28s cubic-bezier(.4,0,.2,1);
          font-family: var(--serif-cn); z-index: 95;
          display: flex; flex-direction: column; overflow: hidden;
        }
        #ppl-settings-drawer.is-open { transform: translateX(0); }
        #ppl-settings-drawer .pst-head {
          padding: 14px 18px; border-bottom: 1px solid rgba(168,73,42,.18);
          display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        #ppl-settings-drawer .pst-head h3 {
          margin: 0; font-size: var(--fs-md); font-weight: 500; color: var(--ink);
          font-family: var(--serif-cn);
        }
        #ppl-settings-drawer .pst-close {
          margin-left: auto; cursor: pointer; font-size: var(--fs-lg); line-height: 1;
          color: var(--gold-deep); opacity: .6; padding: 4px 8px; border-radius: 4px;
          background: none; border: none;
        }
        #ppl-settings-drawer .pst-close:hover {
          opacity: 1; background: rgba(168,73,42,.1);
        }
        #ppl-settings-drawer .pst-body {
          flex: 1; overflow-y: auto; padding: 16px 18px 24px;
        }
        #ppl-settings-drawer .pst-section {
          margin-bottom: 22px;
        }
        #ppl-settings-drawer .pst-section-h {
          font-family: var(--mono);
          font-size: var(--fs-2xs); color: var(--gold-deep);
          letter-spacing: 0.08em; text-transform: uppercase;
          margin-bottom: 9px; display: flex; align-items: center; gap: 5px;
        }
        #ppl-settings-drawer .pst-stat-row {
          display: flex; justify-content: space-between; align-items: baseline;
          padding: 5px 0; font-size: var(--fs-xs); color: var(--ink);
          border-bottom: 1px dashed rgba(168,73,42,.12);
        }
        #ppl-settings-drawer .pst-stat-row:last-child { border-bottom: 0; }
        #ppl-settings-drawer .pst-stat-row .pst-k { color: #5a4a3a; }
        #ppl-settings-drawer .pst-stat-row .pst-v {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        #ppl-settings-drawer .pst-btn {
          display: block; width: 100%; text-align: left;
          margin-bottom: 7px; padding: 9px 12px;
          background: #fff; border: 1px solid rgba(168,73,42,.2);
          border-radius: 7px; cursor: pointer;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink); transition: all .15s;
        }
        #ppl-settings-drawer .pst-btn:hover {
          background: #fff5ec; border-color: rgba(168,73,42,.4);
          transform: translateX(2px);
        }
        #ppl-settings-drawer .pst-btn.is-danger {
          color: var(--amber-deep); border-color: rgba(168,73,42,.3);
        }
        #ppl-settings-drawer .pst-btn.is-danger:hover {
          background: rgba(168,73,42,.08); color: #8a3a1f;
        }
        #ppl-settings-drawer .pst-btn small {
          display: block; font-family: var(--mono);
          font-size: var(--fs-2xs); color: #998877; margin-top: 2px;
          letter-spacing: 0.04em;
        }
        #ppl-settings-drawer .pst-code {
          font-family: var(--mono); font-size: var(--fs-2xs);
          background: #1a1714; color: var(--ivory);
          padding: 6px 10px; border-radius: 4px; margin: 4px 0;
          display: block; white-space: pre-wrap; word-break: break-all;
        }
        /* === L · 完成 9 个教学环节庆祝面板 === */
        #ppl-celebrate-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.5);
          opacity: 0; pointer-events: none; transition: opacity .35s;
          z-index: 110; display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(2px);
        }
        #ppl-celebrate-overlay.is-open { opacity: 1; pointer-events: auto; }
        #ppl-celebrate-modal {
          width: 580px; max-width: 92vw; max-height: 88vh;
          background: linear-gradient(180deg, #faf6ee 0%, #fff8ed 100%);
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0,0,0,.32), 0 0 0 1px rgba(106,154,123,.3);
          font-family: var(--serif-cn);
          display: flex; flex-direction: column; overflow: hidden;
          transform: scale(.92) translateY(12px); transition: transform .35s cubic-bezier(.16,1,.3,1);
        }
        #ppl-celebrate-overlay.is-open #ppl-celebrate-modal { transform: scale(1) translateY(0); }
        #ppl-celebrate-modal .pcl-banner {
          padding: 22px 28px 18px;
          background: linear-gradient(135deg, var(--sage, #6a9a7b) 0%, #8eb89f 100%);
          color: #fff;
          position: relative; overflow: hidden;
        }
        #ppl-celebrate-modal .pcl-banner::after {
          content: ""; position: absolute; right: -40px; top: -40px;
          width: 180px; height: 180px; border-radius: 50%;
          background: rgba(255,255,255,.08);
        }
        #ppl-celebrate-modal .pcl-banner h2 {
          margin: 0 0 4px; font-size: var(--fs-xl); font-weight: 500;
          letter-spacing: 0.02em; position: relative; z-index: 1;
        }
        #ppl-celebrate-modal .pcl-banner .pcl-sub {
          font-size: var(--fs-xs); opacity: .9; font-family: var(--mono);
          letter-spacing: 0.06em; position: relative; z-index: 1;
        }
        #ppl-celebrate-modal .pcl-banner .pcl-close {
          position: absolute; top: 14px; right: 16px;
          background: rgba(255,255,255,.18); color: #fff; border: none;
          width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          font-size: var(--fs-sm); line-height: 1; z-index: 2;
        }
        #ppl-celebrate-modal .pcl-banner .pcl-close:hover { background: rgba(255,255,255,.28); }
        #ppl-celebrate-modal .pcl-body {
          flex: 1; overflow-y: auto; padding: 20px 28px 8px;
        }
        #ppl-celebrate-modal .pcl-section {
          margin-bottom: 18px;
        }
        #ppl-celebrate-modal .pcl-section-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--gold-deep); letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
        }
        #ppl-celebrate-modal .pcl-stage-list {
          display: flex; flex-direction: column; gap: 5px;
        }
        #ppl-celebrate-modal .pcl-stage-row {
          display: grid; grid-template-columns: 28px 1fr auto;
          align-items: baseline; gap: 10px; padding: 5px 8px;
          background: rgba(168,73,42,.04); border-radius: 6px;
          font-size: var(--fs-xs); color: var(--ink);
        }
        #ppl-celebrate-modal .pcl-stage-row .pcl-sn {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        #ppl-celebrate-modal .pcl-stage-row .pcl-cn { font-weight: 500; }
        #ppl-celebrate-modal .pcl-stage-row .pcl-jud {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: #5a4a3a; font-weight: 500; opacity: .8;
        }
        #ppl-celebrate-modal .pcl-stat-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        }
        #ppl-celebrate-modal .pcl-stat-card {
          background: #fff; border: 1px solid rgba(168,73,42,.15);
          border-radius: 8px; padding: 9px 12px;
        }
        #ppl-celebrate-modal .pcl-stat-card .pcl-stat-l {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: #998877; letter-spacing: 0.06em;
        }
        #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v {
          font-family: var(--serif-cn); font-size: var(--fs-md);
          color: var(--amber-deep, #a8492a); font-weight: 500; margin-top: 2px;
        }
        #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v small {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: #998877; font-weight: 400; margin-left: 4px;
        }
        #ppl-celebrate-modal .pcl-foot {
          padding: 14px 28px 20px; border-top: 1px solid rgba(168,73,42,.12);
          display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0;
          background: rgba(168,73,42,.03);
        }
        #ppl-celebrate-modal .pcl-foot button {
          flex: 1; min-width: 0;
          padding: 9px 14px; border-radius: 7px; cursor: pointer;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          border: 1px solid rgba(168,73,42,.25); background: #fff;
          color: var(--ink); transition: all .15s;
        }
        #ppl-celebrate-modal .pcl-foot button:hover {
          background: #fff5ec; transform: translateY(-1px);
        }
        #ppl-celebrate-modal .pcl-foot button.is-primary {
          background: var(--amber-deep, #a8492a); color: #fff; border-color: var(--amber-deep, #a8492a);
        }
        #ppl-celebrate-modal .pcl-foot button.is-primary:hover {
          background: #8a3a1f;
        }

        /* ======= O · DARK MODE 覆盖 ======= */
        /* Settings 抽屉 */
        html[data-theme="dark"] #ppl-settings-drawer {
          background: linear-gradient(180deg, #211f1d 0%, #1a1916 100%);
          box-shadow: -8px 0 24px rgba(0,0,0,.5);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-head { border-bottom-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-head h3 { color: var(--ivory); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-close { color: var(--on-dark-mute); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-close:hover { background: rgba(255,253,247,.08); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-section-h { color: var(--on-dark-mute); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-stat-row {
          color: var(--on-dark); border-bottom-color: rgba(255,253,247,.08);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-stat-row .pst-k { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-stat-row .pst-v { color: var(--amber-soft, #f1cdb9); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn {
          background: rgba(255,253,247,.06);
          border-color: rgba(255,253,247,.12);
          color: var(--ivory);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn:hover {
          background: rgba(255,253,247,.10); border-color: rgba(217,119,87,.4);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn small { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn.is-danger { color: var(--amber); border-color: rgba(217,119,87,.4); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn.is-danger:hover {
          background: rgba(217,119,87,.15); color: var(--amber-soft);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-code {
          background: #0d0c0a; color: var(--amber-soft, #f1cdb9);
        }

        /* 主题切换器（segment control） */
        .pst-theme-row {
          display: flex; gap: 4px; padding: 3px;
          background: rgba(168,73,42,.08); border-radius: 8px;
        }
        html[data-theme="dark"] .pst-theme-row { background: rgba(255,253,247,.06); }
        .pst-theme-row button {
          flex: 1; padding: 6px 8px; font-size: var(--fs-2xs);
          background: transparent; border: 0; border-radius: 5px;
          color: var(--gold-deep); cursor: pointer;
          font-family: var(--serif-cn);
          transition: all .15s;
        }
        html[data-theme="dark"] .pst-theme-row button { color: var(--on-dark-mute); }
        .pst-theme-row button:hover { background: rgba(255,255,255,.5); }
        html[data-theme="dark"] .pst-theme-row button:hover { background: rgba(255,253,247,.08); }
        .pst-theme-row button.is-active {
          background: #fff; color: var(--amber-deep, #a8492a);
          box-shadow: 0 1px 3px rgba(0,0,0,.1);
        }
        html[data-theme="dark"] .pst-theme-row button.is-active {
          background: #2a2722; color: var(--amber-soft, #f1cdb9);
        }

        /* 庆祝面板 dark */
        html[data-theme="dark"] #ppl-celebrate-modal {
          background: linear-gradient(180deg, #211f1d 0%, #1a1916 100%);
          box-shadow: 0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(106,154,123,.4);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-body { color: var(--on-dark); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-section-h { color: var(--on-dark-mute); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stage-row {
          background: rgba(255,253,247,.04); color: var(--ivory);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stage-row .pcl-jud { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card {
          background: rgba(255,253,247,.04); border-color: rgba(255,253,247,.10);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card .pcl-stat-l { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v { color: var(--amber-soft, #f1cdb9); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v small { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-foot {
          background: rgba(255,253,247,.03); border-top-color: rgba(255,253,247,.10);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-foot button {
          background: rgba(255,253,247,.06); color: var(--ivory);
          border-color: rgba(255,253,247,.14);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-foot button:hover { background: rgba(255,253,247,.10); }

        /* L2 议程横条 · 量规修订面板 · 产物按钮区 dark */
        html[data-theme="dark"] #ppl-agenda-strip {
          background: linear-gradient(90deg, rgba(217,119,87,.12), rgba(217,119,87,.06));
          border-bottom-color: rgba(217,119,87,.3);
          color: var(--amber-soft);
        }
        html[data-theme="dark"] #ppl-agenda-strip a { color: var(--amber-soft); }
        html[data-theme="dark"] #ppl-agenda-strip .ppl-settings-btn { color: var(--amber-soft); }
        html[data-theme="dark"] #ppl-agenda-strip .ppl-settings-btn:hover { background: rgba(217,119,87,.2); }
        html[data-theme="dark"] .ppl-artifact-zone {
          background: rgba(255,253,247,.03); border-left-color: var(--amber);
        }
        html[data-theme="dark"] .ppl-artifact-zone .ppl-zone-title { color: var(--amber-soft); }
        html[data-theme="dark"] .ppl-revision-zone {
          background: rgba(217,119,87,.08); border-left-color: var(--amber);
        }
        html[data-theme="dark"] .ppl-revision-zone .ppl-rv-title { color: var(--amber-soft); }
        html[data-theme="dark"] .ppl-rv-form select,
        html[data-theme="dark"] .ppl-rv-form textarea {
          background: rgba(255,253,247,.06); color: var(--ivory);
          border-color: rgba(255,253,247,.14);
        }
        html[data-theme="dark"] .ppl-rv-card {
          background: rgba(255,253,247,.04); border-color: rgba(255,253,247,.10);
          color: var(--on-dark);
        }
        html[data-theme="dark"] .ppl-rv-card .ppl-rv-dim { color: var(--amber-soft); }
        html[data-theme="dark"] .ppl-rv-card .ppl-rv-meta { color: var(--mute-2); }
        .ppl-artifact-zone {
          margin-top: 14px; padding: 12px 14px;
          background: #faf6ee; border-left: 3px solid #a8492a;
          font-family: var(--serif-cn);
        }
        .ppl-artifact-zone .ppl-zone-title {
          font-size: var(--fs-2xs); color: var(--gold-deep); margin-bottom: 8px; letter-spacing: .04em;
        }
        .ppl-artifact-zone button { margin: 4px 8px 4px 0; }
        .ppl-artifact-zone button[disabled] { opacity: .5; cursor: default; }
      `,document.head.appendChild(i)}function W(){const i=document.getElementById("ppl-agenda-strip");i&&i.remove()}function R(){const i=v.dump(),m=new Blob([JSON.stringify(i,null,2)],{type:"application/json"}),T=URL.createObjectURL(m),$=document.createElement("a"),C=new Date().toISOString().slice(0,16).replace(/[T:]/g,"-");$.href=T,$.download=`pharmacoPilot-${C}.json`,document.body.appendChild($),$.click(),$.remove(),setTimeout(()=>URL.revokeObjectURL(T),1e3),h.showDemoToast&&h.showDemoToast("✓ 已导出 JSON · "+$.download)}function J(){const i=document.createElement("input");i.type="file",i.accept="application/json,.json",i.addEventListener("change",()=>{const m=i.files&&i.files[0];if(!m)return;const T=new FileReader;T.onload=()=>{try{const $=JSON.parse(T.result),C=v.importState($);C.ok?(h.showDemoToast&&h.showDemoToast("✓ 已导入 · 刷新页面以应用"),setTimeout(()=>location.reload(),800)):alert("导入失败："+(C.error||"未知错误"))}catch($){alert("JSON 解析失败："+$.message)}},T.readAsText(m)}),i.click()}const X="pharmacoPilot.theme.v1";function ce(){try{return localStorage.getItem(X)||"auto"}catch{return"auto"}}function ve(){const i=ce();return i==="auto"?matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":i}function H(){const i=ve();document.documentElement.setAttribute("data-theme",i)}function ge(i){if(!["light","dark","auto"].includes(i))return;try{localStorage.setItem(X,i)}catch{}H();const m=document.getElementById("ppl-settings-drawer");m&&m.classList.contains("is-open")&&n()}if(H(),window.matchMedia)try{const i=matchMedia("(prefers-color-scheme: dark)"),m=()=>{ce()==="auto"&&H()};i.addEventListener?i.addEventListener("change",m):i.addListener&&i.addListener(m)}catch{}h.__pharmaco=h.__pharmaco||{},h.__pharmaco.setTheme=ge,h.__pharmaco.getTheme=ce;function pe(){if(document.getElementById("ppl-settings-drawer"))return;const i=document.createElement("div");i.id="ppl-settings-overlay",i.addEventListener("click",U);const m=document.createElement("aside");m.id="ppl-settings-drawer",m.setAttribute("role","dialog"),m.setAttribute("aria-label","设置面板"),m.innerHTML=`
        <div class="pst-head">
          <h3>⚙ 设置</h3>
          <button class="pst-close" data-pst-action="close" aria-label="关闭">✕</button>
        </div>
        <div class="pst-body" id="pst-body"></div>
      `,document.body.appendChild(i),document.body.appendChild(m),m.addEventListener("click",T=>{const $=T.target.closest("[data-pst-theme]");if($){ge($.getAttribute("data-pst-theme"));return}const C=T.target.closest("[data-pst-action]");if(!C)return;const E=C.getAttribute("data-pst-action");E==="close"?U():E==="export"?R():E==="import"?J():E==="open-celebrate"?(U(),setTimeout(()=>h.__pharmaco&&h.__pharmaco.openCelebrate&&h.__pharmaco.openCelebrate(),300)):E==="reset"&&confirm("确认清空所有已保存的判断、产物、议程、量规修订数据吗？此操作不可撤销。")&&(v.reset(),location.reload())}),document.addEventListener("keydown",T=>{T.key==="Escape"&&m.classList.contains("is-open")&&U()})}function ue(i){return i<1024?i+" B":i<1024*1024?(i/1024).toFixed(1)+" KB":(i/1024/1024).toFixed(2)+" MB"}function n(){const i=document.getElementById("pst-body");if(!i)return;const m=h.PharmacoPilotNavigationContract||{},T=v.dump(),$=(T.agendas||[]).length,C=Object.keys(T.judgments||{}).length,E=Object.values(T.artifacts||{}).reduce((ie,$e)=>ie+($e?$e.length:0),0),O=T.rubricRevisions||[],z=O.filter(ie=>ie.status==="pending").length,K=O.filter(ie=>ie.status==="accepted").length,ne=(T.zpdAnchors||[]).length,ye=Object.keys(T.pulseRules||{}).length,Z=q(),ae=T.agendaFulfillment||{},ee=ie=>Object.keys(ae[ie]||{}).length;let se=0;try{const ie=localStorage.getItem("pharmacoPilot.state.v1")||"";se=new Blob([ie]).size}catch{}i.innerHTML=`
        <div class="pst-section">
          <div class="pst-section-h">📊 进度概览</div>
          <div class="pst-stat-row"><span class="pst-k">9 个教学环节完成</span><span class="pst-v">${Z?Z.done:0} / 9</span></div>
          <div class="pst-stat-row"><span class="pst-k">子节点判断已保存</span><span class="pst-v">${C} / 11</span></div>
          <div class="pst-stat-row"><span class="pst-k">产物已生成</span><span class="pst-v">${E}</span></div>
          <div class="pst-stat-row"><span class="pst-k">学生议程</span><span class="pst-v">${$} 条</span></div>
          <div class="pst-stat-row"><span class="pst-k">议程兑现轨迹</span><span class="pst-v">S2 ${ee(4)} · S4 ${ee(6)} · S5 ${ee(8)} · S8 ${ee(11)}</span></div>
          <div class="pst-stat-row"><span class="pst-k">学情校准点</span><span class="pst-v">${ne} 个 · 规则 ${ye} 条</span></div>
          <div class="pst-stat-row"><span class="pst-k">量规反向修订</span><span class="pst-v">待审 ${z} · 已采纳 ${K}</span></div>
        </div>

        <div class="pst-section">
          <div class="pst-section-h">💾 数据管理</div>
          <button class="pst-btn" data-pst-action="export">
            ⬇ 导出 JSON
            <small>跨设备搬数据 · 当前 ${ue(se)}</small>
          </button>
          <button class="pst-btn" data-pst-action="import">
            ⬆ 导入 JSON
            <small>从其他设备的导出文件恢复</small>
          </button>
          <button class="pst-btn is-danger" data-pst-action="reset">
            🗑 重置全部
            <small>清空判断 / 产物 / 议程 / 量规修订（不可撤销）</small>
          </button>
        </div>

        <div class="pst-section">
          <div class="pst-section-h">ℹ 系统信息</div>
          <div class="pst-stat-row"><span class="pst-k">Contract 版本</span><span class="pst-v">${b(m.VERSION||"?")}</span></div>
          <div class="pst-stat-row"><span class="pst-k">教学环节数</span><span class="pst-v">${(m.NAV_STAGES||[]).length}</span></div>
          <div class="pst-stat-row"><span class="pst-k">子节点数</span><span class="pst-v">${Object.keys(m.SUB_NODES||{}).length}</span></div>
          <div class="pst-stat-row"><span class="pst-k">横向机制</span><span class="pst-v">动态评估 · 议程贯通 · 产出链</span></div>
          <div class="pst-stat-row"><span class="pst-k">量规反向修订通道</span><span class="pst-v">${m.RUBRIC_REVISION?"S7 → S2":"未启用"}</span></div>
        </div>

        ${Z&&Z.done===Z.total?`
        <div class="pst-section">
          <div class="pst-section-h">🎉 教学设计已完整</div>
          <button class="pst-btn" data-pst-action="open-celebrate">
            📋 查看完成总结面板
            <small>9 个教学环节速览 + 横向闭环统计 + 导出 plan.md</small>
          </button>
        </div>`:""}

        <div class="pst-section">
          <div class="pst-section-h">🎨 外观主题</div>
          <div class="pst-theme-row" data-pst-theme-row>
            <button data-pst-theme="light" class="${ce()==="light"?"is-active":""}">◐ 浅色</button>
            <button data-pst-theme="dark" class="${ce()==="dark"?"is-active":""}">◑ 深色</button>
            <button data-pst-theme="auto" class="${ce()==="auto"?"is-active":""}">☉ 跟随系统</button>
          </div>
        </div>

        <div class="pst-section">
          <div class="pst-section-h">🛠 调试</div>
          <span class="pst-code">__pharmaco.dump()</span>
          <span class="pst-code">__pharmaco.export()</span>
          <span class="pst-code">__pharmaco.openCelebrate()</span>
        </div>
      `}function xe(){pe(),n(),document.getElementById("ppl-settings-overlay").classList.add("is-open"),document.getElementById("ppl-settings-drawer").classList.add("is-open")}function U(){const i=document.getElementById("ppl-settings-overlay"),m=document.getElementById("ppl-settings-drawer");i&&i.classList.remove("is-open"),m&&m.classList.remove("is-open")}v.on("judgment:saved",()=>{const i=document.getElementById("ppl-settings-drawer");i&&i.classList.contains("is-open")&&n()}),v.on("artifact:saved",()=>{const i=document.getElementById("ppl-settings-drawer");i&&i.classList.contains("is-open")&&n()}),v.on("agenda:fulfilled",W),v.on("agenda:listChanged",W),setTimeout(W,100);const V="pharmacoPilot.celebrated.v1";function re(){if(document.getElementById("ppl-celebrate-overlay"))return;const i=document.createElement("div");i.id="ppl-celebrate-overlay",i.innerHTML='<div id="ppl-celebrate-modal" role="dialog" aria-label="教学设计已成形"></div>',i.addEventListener("click",m=>{m.target.id==="ppl-celebrate-overlay"&&Ae()}),document.body.appendChild(i),document.addEventListener("keydown",m=>{m.key==="Escape"&&i.classList.contains("is-open")&&Ae()})}function de(){const i=q();return i&&i.done===i.total}function Le(){const i=document.getElementById("ppl-celebrate-modal");if(!i)return;const m=h.PharmacoPilotNavigationContract||{},T=m.NAV_STAGES||[],$=m.SUB_NODES||{},C=v.dump(),E=C.judgments||{},O=(C.agendas||[]).length,z=C.agendaFulfillment||{},K=me=>Object.keys(z[me]||{}).length,ne=Object.values(C.artifacts||{}).reduce((me,Ce)=>me+(Ce?Ce.length:0),0),ye=(C.zpdAnchors||[]).length,Z=Object.keys(C.pulseRules||{}).length,ae=C.rubricRevisions||[],ee=ae.filter(me=>me.status==="pending").length,se=ae.filter(me=>me.status==="accepted").length,ie=T.map((me,Ce)=>{const Se=(me.subNodeIds||[]).map(String).map(He=>{const Qe=$[He]||{},Ve=typeof Qe.legacyStationId=="number"?Qe.legacyStationId:Number(He),Me=E[Ve];return Me?Me.label||Me.key||"?":"—"}),Re=Se.length===1?Se[0]:Se.join(" · "),Je=Re.length>28?Re.slice(0,28)+"…":Re;return`<div class="pcl-stage-row">
          <span class="pcl-sn">${String(Ce+1).padStart(2,"0")}</span>
          <span class="pcl-cn">${b(me.tag||"")} · ${b(me.displayName||me.title)}</span>
          <span class="pcl-jud" title="${b(Re)}">${b(Je)}</span>
        </div>`}).join(""),Pe=[4,6,8,11].map(me=>K(me)).reduce((me,Ce)=>me+Ce,0),Ie=O*4,Ne=Ie?Math.round(Pe/Ie*100):0;i.innerHTML=`
        <div class="pcl-banner">
          <button class="pcl-close" data-pcl-action="close" aria-label="关闭">✕</button>
          <h2>✓ 一节完整的教学设计已成形</h2>
          <div class="pcl-sub">9 个教学环节 · 12 子节点 · 全部判断已落库</div>
        </div>
        <div class="pcl-body">
          <div class="pcl-section">
            <div class="pcl-section-h">📋 9 个教学环节速览</div>
            <div class="pcl-stage-list">${ie}</div>
          </div>

          <div class="pcl-section">
            <div class="pcl-section-h">🔗 横向机制闭环</div>
            <div class="pcl-stat-grid">
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">L2 议程线</div>
                <div class="pcl-stat-v">${O} 条<small>· 跨站兑现 ${Ne}%</small></div>
              </div>
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">动态学情触发</div>
                <div class="pcl-stat-v">${ye} 锚点<small>· ${Z} 条规则</small></div>
              </div>
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">量规反向修订</div>
                <div class="pcl-stat-v">${se}<small>· 已采纳${ee?" · 待审 "+ee:""}</small></div>
              </div>
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">教学产物</div>
                <div class="pcl-stat-v">${ne}<small>份</small></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pcl-foot">
          <button data-pcl-action="export-plan" class="is-primary">⬇ 导出完整教案 plan.md</button>
          <button data-pcl-action="export-json">⬇ 导出 JSON 备份</button>
          <button data-pcl-action="close">稍后</button>
        </div>
      `,i.addEventListener("click",_e)}function _e(i){const m=i.target.closest("[data-pcl-action]");if(!m)return;const T=m.getAttribute("data-pcl-action");T==="close"?Ae():T==="export-json"?R():T==="export-plan"&&Be()}function Be(){const i=h.PharmacoPilotNavigationContract||{},m=i.NAV_STAGES||[],T=i.SUB_NODES||{},$=h.PharmacoPilotStationPayloads||{},C=v.dump(),E=C.judgments||{};let O=`# 一节完整的教学设计（v4 · 9 个教学环节）

`;O+=`生成时间：${new Date().toLocaleString("zh-CN",{hour12:!1})}
`,O+=`Contract：${i.VERSION||"?"}
`,O+=`示例案例：药事管理 · SWOT · 华海药业 · 集采常态化

`,O+=`---

## 9 个教学环节速览

`,m.forEach((Z,ae)=>{O+=`### ${String(ae+1).padStart(2,"0")} ${Z.tag} · ${Z.displayName||Z.title}

`,O+=`**关键判断**：${Z.keyDecision||"—"}

`,(Z.subNodeIds||[]).forEach(se=>{const ie=T[String(se)]||{},$e=typeof ie.legacyStationId=="number"?ie.legacyStationId:Number(se),Pe=E[$e];O+=`- **子节点 ${se}** ${ie.subTitle||""}
`,O+=`  - 判断：${Pe?Pe.label||Pe.key:"（未保存）"}
`;const Ie=C.artifacts&&C.artifacts[$e];Ie&&Ie.length&&Ie.forEach(Ne=>{O+=`  - 产物：${Ne.data&&Ne.data.title||Ne.artifactId}
`})}),O+=`
`}),O+=`---

## 横向机制

`,O+=`### L2 学习者议程线

`,(C.agendas||[]).forEach((Z,ae)=>{O+=`${ae+1}. ${Z.text||Z.key} · 票数 ${Z.votes||0}
`;const ee=[];[4,6,8,11].forEach(se=>{(C.agendaFulfillment||{})[se]&&C.agendaFulfillment[se][Z.key]&&ee.push(`S${se===4?2:se===6?4:se===8?5:8}`)}),ee.length&&(O+=`   兑现：${ee.join(" → ")}
`)}),O+=`
### 动态学情触发（学情校准点 + 决策规则）

`,(C.zpdAnchors||[]).forEach(Z=>{const ae=(C.pulseRules||{})[Z.id];O+=`- **${Z.id}** · ${Z.t}' · ${Z.label}
`,ae&&(O+=`  - 微评估：${ae.microFormat||""}
`,O+=`  - 如果：${ae.ifCond||""}
`,O+=`  - 则：${ae.thenAct||""}
`)}),O+=`
### 量规反向修订（S7 → S2）

`,(C.rubricRevisions||[]).forEach(Z=>{O+=`- **${Z.dim}** [${Z.status}]
`,O+=`  - 问题：${Z.reason}
`,Z.proposedChange&&(O+=`  - 建议：${Z.proposedChange}
`)}),O+=`
---
*由 PharmacoPilot ${i.VERSION||"v4"} 生成*
`;const z=new Blob([O],{type:"text/markdown;charset=utf-8"}),K=URL.createObjectURL(z),ne=document.createElement("a"),ye=new Date().toISOString().slice(0,16).replace(/[T:]/g,"-");ne.href=K,ne.download=`pharmacoPilot-plan-${ye}.md`,document.body.appendChild(ne),ne.click(),ne.remove(),setTimeout(()=>URL.revokeObjectURL(K),1e3),h.showDemoToast&&h.showDemoToast("✓ 已导出完整教案 · "+ne.download)}function he(){re(),Le(),document.getElementById("ppl-celebrate-overlay").classList.add("is-open")}function Ae(){const i=document.getElementById("ppl-celebrate-overlay");i&&i.classList.remove("is-open")}function Oe(){if(de()&&localStorage.getItem(V)!=="1"){try{localStorage.setItem(V,"1")}catch{}setTimeout(he,350)}}v.on("judgment:saved",Oe),v.on("store:reset",()=>{try{localStorage.removeItem(V)}catch{}}),h.__pharmaco=h.__pharmaco||{},h.__pharmaco.openCelebrate=he;function je(i,m,T,$){if(i===6&&m==="agenda-evidence-map"){($.evidenceFigure&&$.evidenceFigure.agendaCoverageDots||[]).filter(E=>E.covered).forEach(E=>{v.markAgendaFulfilled(6,E.agendaKey,E.evidenceSrc)});return}if(i===8&&(m==="role-task-card"||T.sideEffect==="markAgendaRoleMatched")){($.evidenceFigure&&$.evidenceFigure.roleSuggestions||[]).forEach(E=>{v.markAgendaFulfilled(8,E.agendaKey,{role:E.suggestedRole,reason:E.reason})});return}if(i===7&&(m==="timeline-with-anchors"||T.sideEffect==="writeZpdAnchors")){const C=$.evidenceFigure&&$.evidenceFigure.zpdAnchors||[];C.length&&v.setZpdAnchors(C);return}if(i===9&&(m==="pulse-rule-table"||T.sideEffect==="writePulseRules")){($.evidenceFigure&&$.evidenceFigure.pulseRules||[]).forEach(E=>{v.setPulseRule(E.anchorId,{t:E.t,microFormat:E.microFormat,ifCond:E.ifCond,thenAct:E.thenAct})});return}if(i===11&&(m==="review-report"||T.sideEffect==="closeL2Loop")){v.getAgendas().forEach(C=>{const E=(v.getAgendaFulfillment(6)||{})[C.key],O=(v.getAgendaFulfillment(8)||{})[C.key];v.markAgendaFulfilled(11,C.key,{stationsCovered:[E&&6,O&&8].filter(Boolean),reviewedAt:Date.now()})});return}if(i===3&&(m==="agenda-list"||T.sideEffect==="seedAgendasFromStation3")){const C=$.evidenceFigure&&$.evidenceFigure.mockStudentResponses&&$.evidenceFigure.mockStudentResponses.clusters||[];C.length&&v.setAgendas(C.map(E=>({key:E.agendaKey,text:E.text,votes:E.studentVotes,sourceStation:3})));return}if(i===4&&(m==="agenda-goal-map"||T.sideEffect==="mapAgendasToGoals")){const C=$.evidenceFigure&&$.evidenceFigure.goalEvidenceMap||[];v.getAgendas().forEach((E,O)=>{const z=O%Math.max(C.length,1);v.markAgendaFulfilled(4,E.key,{mappedToGoal:C[z]&&C[z].goal,evidence:C[z]&&C[z].evidence})});return}}function De(){const i=h.__navRenderState||{},m=i.currentSubKey&&i.currentSubKey()||null;return m&&v.getJudgment(m)?!0:!!v.getJudgment(u)}function be(i){const m=w[u];if(!m||!m.artifacts)return;const T=document.querySelector(".decision-dock");if(!T)return;const $=T.querySelector(".ppl-artifact-zone");if($&&!(i&&i.force))return;$&&$.remove(),D();const C=v.getArtifacts(u).map(Z=>Z.artifactId);let E=m.artifacts,O="";if(m.isSplit&&m.splitMap){const Z=h.PharmacoPilotNavigationContract,ae=window.__navRenderState||{},ee=ae.currentStageId&&ae.currentStageId();let se=null;Object.keys(m.splitMap).forEach(ie=>{m.splitMap[ie].stageId===ee&&(se=m.splitMap[ie])}),se&&se.artifactIds&&(E=m.artifacts.filter(ie=>se.artifactIds.indexOf(ie.id)!==-1),O=" · "+se.subTitle)}const z=(u===8?"产物生成区 · L2 议程角色匹配":u===6?"产物生成区 · 议程兑现":"产物生成区")+O,K=!De(),ne=K?'<div class="ppl-artifact-gate">⛌ 先保存判断才能解锁产物生成</div>':"",ye=document.createElement("div");ye.className="ppl-artifact-zone"+(K?" is-gated":""),ye.innerHTML=`<div class="ppl-zone-title">${b(z)}</div>`+ne+E.map(Z=>{const ae=C.indexOf(Z.id)!==-1,ee=ae||K;return`<button class="btn-s${ae||K?"":" is-recommend"}" data-artifact-id="${Z.id}"${ee?" disabled":""}>${ae?"✓ "+b(Z.outputTitle)+" · 已落库":b(Z.buttonLabel)}</button>`}).join(""),T.appendChild(ye),ye.querySelectorAll("button[data-artifact-id]").forEach(Z=>{Z.addEventListener("click",()=>{if(K){h.showDemoToast&&h.showDemoToast("先保存判断才能生成产物");return}const ae=Z.getAttribute("data-artifact-id"),ee=m.artifacts.find(se=>se.id===ae);ee&&(v.saveArtifact(u,ae,{title:ee.outputTitle,cue:ee.outputCue,payload:ee.payload||ee.template}),je(u,ae,ee,m),Z.textContent="✓ "+ee.outputTitle+" · 已落库",Z.classList.remove("is-recommend"),Z.disabled=!0,h.showDemoToast&&h.showDemoToast("✓ 已生成产物 · "+ee.outputTitle))})})}setTimeout(be,120),v.on("judgment:saved",()=>{setTimeout(()=>be({force:!0}),30)});function ze(){if(document.getElementById("ppl-rubric-revision-styles"))return;const i=document.createElement("style");i.id="ppl-rubric-revision-styles",i.textContent=`
        .ppl-revision-zone {
          margin-top: 14px; padding: 12px 14px;
          background: #fff5ec; border-left: 3px solid #a8492a;
          font-family: var(--serif-cn);
        }
        .ppl-revision-zone .ppl-rv-title {
          font-size: var(--fs-2xs); color: var(--gold-deep); margin-bottom: 8px; letter-spacing: 0.04em;
          display: flex; align-items: center; gap: 8px;
        }
        .ppl-revision-zone .ppl-rv-badge {
          background: #a8492a; color: #fff; padding: 1px 7px; border-radius: 10px; font-size: var(--fs-2xs);
        }
        .ppl-rv-form { display: grid; grid-template-columns: 160px 1fr 1fr auto; gap: 6px; align-items: start; }
        .ppl-rv-form select, .ppl-rv-form textarea {
          font-family: inherit; font-size: var(--fs-xs); padding: 6px 8px;
          border: 1px solid rgba(168,73,42,.25); border-radius: 6px;
          background: #fff; color: var(--ink);
        }
        .ppl-rv-form textarea { min-height: 52px; resize: vertical; }
        .ppl-rv-form button { white-space: nowrap; }
        .ppl-rv-list { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .ppl-rv-card {
          background: #fff; border: 1px solid rgba(168,73,42,.18); border-radius: 8px;
          padding: 10px 12px; font-size: var(--fs-xs);
        }
        .ppl-rv-card.is-resolved { opacity: .55; }
        .ppl-rv-card .ppl-rv-meta {
          display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--gold-deep);
        }
        .ppl-rv-card .ppl-rv-dim { color: var(--amber-deep, #a8492a); font-weight: 600; }
        .ppl-rv-card .ppl-rv-status { margin-left: auto; padding: 1px 6px; border-radius: 8px; font-size: var(--fs-2xs); }
        .ppl-rv-card .ppl-rv-status.s-pending  { background: #fef0d9; color: var(--amber-deep); }
        .ppl-rv-card .ppl-rv-status.s-accepted { background: #e3f0e3; color: var(--ok); }
        .ppl-rv-card .ppl-rv-status.s-rejected { background: #eaeaea; color: #777; }
        .ppl-rv-card .ppl-rv-actions { margin-top: 6px; display: flex; gap: 6px; }
        .ppl-rv-card .ppl-rv-actions button {
          font-size: var(--fs-2xs); padding: 3px 10px; border-radius: 4px;
          border: 1px solid rgba(168,73,42,.3); background: #fff; cursor: pointer;
        }
        .ppl-rv-card .ppl-rv-actions button.accept { background: var(--sage, #6a9a7b); color: #fff; border-color: var(--sage, #6a9a7b); }
        .ppl-rv-card .ppl-rv-actions button.reject { color: #777; }
        /* Chip 徽章：S2 待审修订 N 条 */
        [data-stage="S2"] .stage-revision-badge {
          position: absolute; top: 7px; left: 6px;
          background: var(--amber-deep, #a8492a); color: #fff;
          font-family: var(--mono); font-size: var(--fs-2xs);
          padding: 1px 5px; border-radius: 8px;
          box-shadow: 0 0 0 2px rgba(217,119,87,.25);
        }
      `,document.head.appendChild(i)}function ke(){ze(),u===4?We():u===10&&Ke(),Ee()}function Ke(){const i=document.querySelector(".decision-dock");if(!i||i.querySelector(".ppl-revision-zone"))return;const m=w[10],T=m&&m.evidenceFigure&&m.evidenceFigure.rubric||[],$=v.getRubricRevisions().slice().sort((O,z)=>z.proposedAt-O.proposedAt),C=document.createElement("div");C.className="ppl-revision-zone",C.innerHTML=`
        <div class="ppl-rv-title">
          <span>S7 → S2 量规反向修订通道</span>
          ${$.length?`<span class="ppl-rv-badge">已提 ${$.length} 条</span>`:""}
        </div>
        <div class="ppl-rv-form">
          <select id="ppl-rv-dim">
            <option value="">选择维度…</option>
            ${T.map(O=>`<option value="${b(O.dim)}">${b(O.dim)}</option>`).join("")}
          </select>
          <textarea id="ppl-rv-reason" placeholder="发现的问题（如：该维度区分度不足 / 阈值过严 / 缺失关键观察点）"></textarea>
          <textarea id="ppl-rv-proposed" placeholder="建议的修订（如：4 分阈值由 80 改为 75 / 新增「批判意识」子维度）"></textarea>
          <button class="btn-s is-recommend" id="ppl-rv-submit">向 S2 提出修订</button>
        </div>
        <div class="ppl-rv-list" id="ppl-rv-list"></div>
      `,i.appendChild(C);const E=()=>{const O=C.querySelector("#ppl-rv-list"),z=v.getRubricRevisions().slice().sort((K,ne)=>ne.proposedAt-K.proposedAt);if(!z.length){O.innerHTML="";return}O.innerHTML=z.map(K=>`
          <div class="ppl-rv-card${K.status!=="pending"?" is-resolved":""}">
            <div class="ppl-rv-meta">
              <span class="ppl-rv-dim">${b(K.dim)}</span>
              <span>${new Date(K.proposedAt).toLocaleString("zh-CN",{hour12:!1})}</span>
              <span class="ppl-rv-status s-${K.status}">${K.status==="pending"?"待审":K.status==="accepted"?"✓ 已采纳":"✗ 已驳回"}</span>
            </div>
            <div>${b(K.reason)}</div>
            ${K.proposedChange?`<div style="margin-top:4px;color:var(--gold-deep)">建议：${b(K.proposedChange)}</div>`:""}
          </div>
        `).join("")};E(),v.on("rubric:revisionProposed",E),v.on("rubric:revisionResolved",E),C.querySelector("#ppl-rv-submit").addEventListener("click",()=>{const O=C.querySelector("#ppl-rv-dim").value,z=C.querySelector("#ppl-rv-reason").value.trim(),K=C.querySelector("#ppl-rv-proposed").value.trim();if(!O||!z){h.showDemoToast&&h.showDemoToast("✕ 维度和问题描述必填");return}v.proposeRubricRevision({dim:O,reason:z,proposedChange:K}).ok&&(h.showDemoToast&&h.showDemoToast("✓ 已向 S2 提出修订 · "+O),C.querySelector("#ppl-rv-dim").value="",C.querySelector("#ppl-rv-reason").value="",C.querySelector("#ppl-rv-proposed").value="")})}function We(){const i=document.querySelector(".decision-dock");if(!i||i.querySelector(".ppl-revision-zone"))return;const m=v.getRubricRevisions("pending");if(!v.getRubricRevisions().length)return;const $=document.createElement("div");$.className="ppl-revision-zone",$.innerHTML=`
        <div class="ppl-rv-title">
          <span>来自 S7 的量规修订建议</span>
          ${m.length?`<span class="ppl-rv-badge">待审 ${m.length} 条</span>`:'<span style="color:var(--ok)">✓ 全部处理完毕</span>'}
        </div>
        <div class="ppl-rv-list" id="ppl-rv-s2-list"></div>
      `,i.appendChild($);const C=()=>{const E=$.querySelector("#ppl-rv-s2-list"),O=v.getRubricRevisions().slice().sort((z,K)=>z.status==="pending"&&K.status!=="pending"?-1:z.status!=="pending"&&K.status==="pending"?1:K.proposedAt-z.proposedAt);E.innerHTML=O.map(z=>`
          <div class="ppl-rv-card${z.status!=="pending"?" is-resolved":""}" data-rev-id="${b(z.id)}">
            <div class="ppl-rv-meta">
              <span class="ppl-rv-dim">${b(z.dim)}</span>
              <span>${new Date(z.proposedAt).toLocaleString("zh-CN",{hour12:!1})}</span>
              <span class="ppl-rv-status s-${z.status}">${z.status==="pending"?"待审":z.status==="accepted"?"✓ 已采纳":"✗ 已驳回"}</span>
            </div>
            <div>${b(z.reason)}</div>
            ${z.proposedChange?`<div style="margin-top:4px;color:var(--gold-deep)">建议：${b(z.proposedChange)}</div>`:""}
            ${z.status==="pending"?`
              <div class="ppl-rv-actions">
                <button class="accept" data-rev-act="accepted">采纳并写入量规 v2</button>
                <button class="reject" data-rev-act="rejected">驳回（保留备注）</button>
              </div>`:""}
          </div>
        `).join("")};C(),v.on("rubric:revisionResolved",C),$.addEventListener("click",E=>{const O=E.target.closest("button[data-rev-act]");if(!O)return;const K=O.closest("[data-rev-id]").getAttribute("data-rev-id"),ne=O.getAttribute("data-rev-act"),ye=v.resolveRubricRevision(K,ne);ye.ok&&(h.showDemoToast&&h.showDemoToast((ne==="accepted"?"✓ 已采纳":"✗ 已驳回")+" · "+ye.revision.dim),Ee())})}function Ee(){const i=document.querySelector('[data-stage="S2"]');if(!i)return;let m=i.querySelector(".stage-revision-badge");const T=v.getRubricRevisions("pending").length;if(!T){m&&m.remove();return}m||(m=document.createElement("span"),m.className="stage-revision-badge",i.appendChild(m)),m.textContent="修订 "+T,m.title=`来自 S7 的待审量规修订 ${T} 条`}setTimeout(ke,140),v.on("rubric:revisionProposed",()=>setTimeout(ke,60)),v.on("rubric:revisionResolved",()=>setTimeout(ke,60)),setInterval(Ee,1500);const Te=be;Te.__rubricPatched||(be=function(){Te.apply(this,arguments),ke()},be.__rubricPatched=!0),document.addEventListener("click",i=>{const m=i.target.closest(".ar-note-save");if(!m)return;const T=m.getAttribute("data-agenda-key");if(!T)return;const C=(m.closest(".ar-note")||document).querySelector(`textarea.ar-note-input[data-agenda-key="${T}"]`),E=C?C.value.trim():"";if(!E){h.showDemoToast&&h.showDemoToast("✕ 请先填写未兑现原因");return}const O=v.saveAgendaUnfulfillmentNote(T,E);O&&O.ok&&(m.textContent="已保存 ✓",m.disabled=!0,setTimeout(()=>{m.textContent="保存",m.disabled=!1},1800),h.showDemoToast&&h.showDemoToast(`✓ 议程「${T}」未兑现原因已记录`))},!0),v.on("agenda:unfulfillmentNoted",()=>{h.__navRenderState&&h.__navRenderState.refreshDetail&&h.__navRenderState.refreshDetail()}),document.addEventListener("click",i=>{const m=i.target.closest("[data-writeback-map]");if(!m)return;const T=parseInt(m.getAttribute("data-station"),10)||A(),$=v.getJudgment(T),C=v.getArtifacts(T)||[],E=h.PharmacoPilotNavigationContract||{},O=E.SUB_NODES&&E.SUB_NODES[String(T)]||{},z=`trainmap-writeback-${T}-${Date.now()}`;v.saveArtifact(T,z,{title:`训练地图写回 · 节点 ${qe(T)}`,kind:"trainmap-writeback",stageId:O.stageId||null,judgment:$?{key:$.key,label:$.label,score:$.score}:null,artifactCount:C.length,writtenAt:new Date().toISOString()}),m.textContent="✓ 已写回训练地图",m.disabled=!0,h.showDemoToast&&h.showDemoToast(`✓ 节点 ${qe(T)} 已写回训练地图 · 判断 + ${C.length} 份产物`)},!0);function qe(i){return String(i).padStart(2,"0")}function b(i){return String(i??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}(function(){try{localStorage.removeItem("pharmacoPilot.mvl.dismissed.v1"),localStorage.removeItem("pharmacoPilot.mvl.afterPrompted.v1")}catch{}const m=document.getElementById("ppl-mvl-banner");m&&m.remove()})(),Object.assign(h.__pharmaco=h.__pharmaco||{},{store:v,dump:()=>v.dump(),reset:()=>v.reset(),progress:()=>v.getProgress(),currentStation:()=>u,export:R}),console.log("[pharmaco-bridge] ✓ initialized · localStorage state bus + payload wiring active")})}(window),function(h){"use strict";const B=h.PharmacoPilotStore;if(!B)return;const N=`
.pr-feedback-badge {
  position: absolute; top: 8px; right: 8px;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 999px;
  background: var(--amber-deep, #a8492a); color: var(--ivory, #fffdf7);
  font-family: var(--mono); font-size: var(--fs-2xs);
  letter-spacing: 0.06em; text-transform: uppercase;
  box-shadow: 0 2px 8px rgba(168, 73, 42, .25);
  z-index: 5;
  animation: pr-fb-pulse 2s ease-in-out infinite;
}
@keyframes pr-fb-pulse {
  0%,100% { transform: scale(1); }
  50%     { transform: scale(1.04); }
}
.pr-feedback-toast {
  position: fixed; right: 24px; bottom: 24px; max-width: 360px;
  padding: 14px 16px;
  background: var(--ink, #1b1916); color: var(--ivory, #fffdf7);
  border-radius: 10px; border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 12px 32px rgba(0,0,0,.25);
  font-family: var(--serif-cn); font-size: var(--fs-xs); line-height: 1.55;
  z-index: 9999;
  opacity: 0; transform: translateY(8px);
  transition: opacity .25s, transform .25s;
}
.pr-feedback-toast.show { opacity: 1; transform: translateY(0); }
.pr-feedback-toast .lbl {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--amber, #d97757);
  margin-bottom: 4px; display: block;
}
.pr-feedback-toast a {
  color: var(--amber-soft, #f1cdb9); text-decoration: underline;
  cursor: pointer;
}
`,v=document.createElement("style");v.textContent=N,document.head.appendChild(v);function l(I){const A=document.querySelectorAll(`[data-station-id="${I}"]`);if(!A.length)return;const M=B.getArtifacts(I).filter(_=>_.data?.sourcePractice).length;M&&A.forEach(_=>{let D=_.querySelector(".pr-feedback-badge");D||(D=document.createElement("div"),D.className="pr-feedback-badge",h.getComputedStyle(_).position==="static"&&(_.style.position="relative"),_.appendChild(D)),D.textContent=`↑ Practice × ${M}`})}function w(){for(let I=1;I<=11;I++)l(I)}function u(I,A){const q=document.createElement("div");q.className="pr-feedback-toast",q.innerHTML=`
      <span class="lbl">来自 practice · 实时写回</span>
      <div>站 ${I} 收到了新的沉淀片段 <b>${A}</b>。
      <br/><a data-anchor="${I}">↓ 跳到这个站</a></div>
    `,document.body.appendChild(q),requestAnimationFrame(()=>q.classList.add("show")),q.querySelector("a").onclick=()=>{const M=document.querySelector(`[data-station-id="${I}"]`);M&&M.scrollIntoView({behavior:"smooth",block:"center"}),q.classList.remove("show"),setTimeout(()=>q.remove(),300)},setTimeout(()=>{q.classList.remove("show"),setTimeout(()=>q.remove(),300)},6e3)}function F(){w(),B.on("artifact:saved",({stationId:I,artifactId:A})=>{l(I),u(I,A)}),B.on("zpd:anchorsChanged",()=>l(7)),B.on("pulse:ruleSaved",()=>l(9))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>setTimeout(F,400)):setTimeout(F,400)}(window);
