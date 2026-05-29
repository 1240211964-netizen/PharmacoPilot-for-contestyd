// Tweaks for direction-bc-editorial-workbench.html
// 3 expressive controls — Palette / Density / Voice — that reshape the feel.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "amber",
  "density": "balanced",
  "voice": "paradigm"
}/*EDITMODE-END*/;

// ============ Palette definitions ============
const PALETTES = {
  amber: {
    label: "暖墨", swatch: ["#d97757", "#a8492a", "#1b1916"],
    vars: {
      "--amber":      "#d97757",
      "--amber-deep": "#a8492a",
      "--amber-soft": "#f1cdb9",
      "--amber-wash": "#f7e6d8",
    }
  },
  brick: {
    label: "砖红", swatch: ["#a04438", "#6f2f2a", "#1b1916"],
    vars: {
      "--amber":      "#a04438",
      "--amber-deep": "#6f2f2a",
      "--amber-soft": "#dcb7b0",
      "--amber-wash": "#efdedb",
    }
  },
  sage: {
    label: "林青", swatch: ["#6c8278", "#4d6257", "#1b1916"],
    vars: {
      "--amber":      "#6c8278",
      "--amber-deep": "#4d6257",
      "--amber-soft": "#c2cfc8",
      "--amber-wash": "#dde4df",
    }
  },
  cobalt: {
    label: "钴墨", swatch: ["#4f6788", "#3a4b6b", "#1b1916"],
    vars: {
      "--amber":      "#4f6788",
      "--amber-deep": "#3a4b6b",
      "--amber-soft": "#c1cad8",
      "--amber-wash": "#dde2eb",
    }
  },
};

// ============ Voice = hero copy variants ============
const VOICES = {
  paradigm: {
    label: "协同范式",
    eyebrow: "No. 04 · 2026 春季封面故事 · 面向新教师",
    h1html: '与新教师<span class="it">协同</span>，<br/>重构<span class="it">药事管理</span>课程，<br/>走向<span class="it">新教学</span>范式。',
    tinyhtml: '把课程纲要、政策案例与临床场景，编织成可审校、可复用、可追溯的教学材料。<br/>9 个教学环节、3 阶段实践流水线、师生双向能力图谱——一套可追溯的教学生产线。',
  },
  partner: {
    label: "教学合伙人",
    eyebrow: "陪你走完第一节药事课 · 课程智能体",
    h1html: '第一节课，<br/>不<span class="it">一个人</span>站讲台。<br/>与你一起<span class="it">备课</span>、<span class="it">模拟</span>、<span class="it">复盘</span>。',
    tinyhtml: 'PharmacoPilot 是新教师的教学合伙人。从备课到沉淀，每一个产出都可被审校、被复用——慢慢长出属于你自己的药事教学手艺。',
  },
  product: {
    label: "工作台直说",
    eyebrow: "PharmacoPilot · Teaching Workbench v2",
    h1html: '药事管理课程的<br/><span class="it">AI 协同</span>工作台。<br/>备课 / 模拟 / <span class="it">沉淀</span>。',
    tinyhtml: '9 个教学环节 + 3 阶段实践流水线 + 师生双向能力实时追踪。<br/>接入泛雅模拟课堂与闻道科学探索，所有产出可审校、可追溯、可复用。',
  },
};

// ============ Apply effects ============
function applyPalette(key) {
  const p = PALETTES[key] || PALETTES.amber;
  Object.entries(p.vars).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v);
  });
}
function applyDensity(key) {
  document.body.classList.remove("dx-mag", "dx-bal", "dx-bench");
  const cls = key === "magazine" ? "dx-mag" : key === "workbench" ? "dx-bench" : "dx-bal";
  document.body.classList.add(cls);
}
function applyVoice(key) {
  const v = VOICES[key] || VOICES.paradigm;
  const eyebrow = document.querySelector('.hero .eyebrow');
  const h1 = document.querySelector('.hero h1');
  const tiny = document.querySelector('.hero .tiny');
  if (eyebrow) eyebrow.textContent = v.eyebrow;
  if (h1) h1.innerHTML = v.h1html;
  if (tiny) tiny.innerHTML = v.tinyhtml;
}

// ============ App ============
function TweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => { applyPalette(t.palette); }, [t.palette]);
  React.useEffect(() => { applyDensity(t.density); }, [t.density]);
  React.useEffect(() => { applyVoice(t.voice); }, [t.voice]);

  const paletteOpts = Object.entries(PALETTES).map(([k, p]) => p.swatch);
  const paletteKeys = Object.keys(PALETTES);
  const paletteIdx  = Math.max(0, paletteKeys.indexOf(t.palette));

  return (
    <TweaksPanel title="Tweaks · 三个旋钮">
      <TweakSection label="色调 · Palette" />
      <div className="twk-row">
        <div className="twk-lbl">
          <span>主色调</span>
          <span className="twk-val">{PALETTES[t.palette]?.label}</span>
        </div>
        <TweakColor
          value={paletteOpts[paletteIdx]}
          options={paletteOpts}
          onChange={(v) => {
            const i = paletteOpts.findIndex(o => JSON.stringify(o) === JSON.stringify(v));
            if (i >= 0) setTweak('palette', paletteKeys[i]);
          }}
        />
      </div>

      <TweakSection label="密度 · Density" />
      <TweakRadio
        label="节奏"
        value={t.density}
        options={[
          { value: 'magazine',  label: '杂志' },
          { value: 'balanced',  label: '平衡' },
          { value: 'workbench', label: '工作台' },
        ]}
        onChange={(v) => setTweak('density', v)}
      />

      <TweakSection label="语气 · Voice" />
      <TweakRadio
        label="文案口吻"
        value={t.voice}
        options={[
          { value: 'paradigm', label: '协同范式' },
          { value: 'partner',  label: '合伙人' },
          { value: 'product',  label: '工作台' },
        ]}
        onChange={(v) => setTweak('voice', v)}
      />

      <div style={{
        marginTop: 8, paddingTop: 10, borderTop: '1px dashed rgba(0,0,0,.1)',
        fontSize: 10.5, color: 'rgba(41,38,27,.5)', lineHeight: 1.5
      }}>
        三个旋钮重塑这个页面的"气质"——不是改一个属性，是切换整体感受。
      </div>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<TweaksApp />);
