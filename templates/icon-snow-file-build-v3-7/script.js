/* Icon Snow — v3.4 (file): dual oscillators, balanced X/Y/Z, first flake from top */
(function(){
  console.log("[snow] v3.4 init");
  var stage = document.getElementById('stage');
  if(!stage){ stage=document.createElement('div'); stage.id='stage'; stage.style.cssText='width:640px;height:300px;background:#f5;position:relative;overflow:hidden;border-radius:16px;margin:24px auto'; document.body.appendChild(stage); }
  var W = stage.clientWidth|0, H = stage.clientHeight|0;
  var margin = 8;

  var ICONS = [
    "assets/cloth.png",
    "assets/round_brush.png",
    "assets/pump_bottle.png",
    "assets/trigger_spray.png",
    "assets/glove.png",
    "assets/rect_brush.png",
    "assets/toilet_brush.png"
  ];

  // Tunables
  var HICON = 600;
  // Speed classes (bimodal)
  var SLOW_MIN=22, SLOW_MAX=34, FAST_MIN=46, FAST_MAX=58, P_SLOW=0.60;
  // Desired density
  var rho = 3.6;
  // X spacing
  var dminFrac = 0.18, marginXFrac = 0.08;
  // River feel
  var tau_pos = 0.34, tau_vx = 0.24;
  var A1=16, A2=9, ky1=0.006, ky2=0.010;
  var driftFreq1=0.05, driftFreq2=0.035, currentAmp=6.0, windFreq=0.04;
  // Rotation
  var rotAmp = Math.PI*5/180, rotTau=0.55;

  // Z-layers (depth): 1..4 with target occupancy weights
  var Z_LAYERS = [1,2,3,4];
  var Z_WEIGHTS = [1,1,1,1]; // equal for now; can bias later
  var zCounts = {1:0,2:0,3:0,4:0};

  // Helpers
  function rnd(a,b){return a+Math.random()*(b-a)}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function mix(a,b,t){return a*(1-t)+b*t}
  function expSmooth(prev,target,dt,tau){ var a=Math.exp(-dt/Math.max(0.001,tau)); return prev*a + target*(1-a); }
  function gauss(){ var u=Math.random(), v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

  // Halton base 2
  var hIndex=1;
  function halton2(n){ var f=0.5, r=0, i=n; while(i>0){ r+=f*(i&1); i>>=1; f*=0.5; } return r; }
  function nextHalton(){ return halton2(hIndex++); }

  // Very slow noise
  function LowNoise(freq){ this.y=0; this.freq=freq; }
  LowNoise.prototype.step=function(dt){ var a=Math.exp(-dt*this.freq); this.y=a*this.y + (1-a)*rnd(-1,1); return this.y; }

  function pickSpeed(cls){
    if (cls==="slow") return rnd(SLOW_MIN, SLOW_MAX);
    return rnd(FAST_MIN, FAST_MAX);
  }

  function Flake(){
    this.el = new Image(); this.el.className="flake"; stage.appendChild(this.el);
    this.src=null; this.wEff=HICON; this.hEff=HICON;
    this.v0 = pickSpeed("slow");
    this.tBorn=performance.now()/1000;
    this.x = W/2; this.y = -HICON - margin;
    this.sx=this.x; this.sy=this.y;
    this.vx=0; this.layer=1;
    this.active=false;
    this.ph1 = Math.random()*Math.PI*2;
    this.ph2 = Math.random()*Math.PI*2;
    this.phi=0; this.sphi=0;
  }
  Flake.prototype.setSource=function(path){
    this.src=path; this.el.src=path;
    this.el.onerror = ()=>{ this.el.removeAttribute('src'); this.el.classList.add('placeholder'); };
  };
  Flake.prototype.xTarget=function(age, globalDrift1, globalDrift2, xAnchor){
    var wav = A1*Math.sin(ky1*this.y + this.ph1 + globalDrift1) + A2*Math.sin(ky2*this.y + this.ph2 + globalDrift2);
    return xAnchor + wav;
  };
  Flake.prototype.update=function(now,dt,globals,params){
    if(!this.active) return;
    // vertical
    var vy = this.v0;
    this.y += vy*dt;

    // viscous towards path + current
    var x_t = this.xTarget(now - this.tBorn, globals.drift1, globals.drift2, this.xAnchor);
    var vx_t = (x_t - this.x)/Math.max(0.08, tau_pos) + globals.current;
    this.vx = expSmooth(this.vx, vx_t, dt, tau_vx);
    this.x += this.vx*dt;

    // walls
    var minX=params.marginX, maxX=W-params.marginX;
    if (this.x<minX){ this.x=minX; this.vx *= -0.5; }
    if (this.x>maxX){ this.x=maxX; this.vx *= -0.5; }

    // smooth render
    this.sx = expSmooth(this.sx, this.x, dt, 0.22);
    this.sy = expSmooth(this.sy, this.y, dt, 0.22);

    // rotation
    var phi_t = clamp(this.vx*0.004 + globals.current*0.015, -rotAmp, rotAmp);
    this.sphi = expSmooth(this.sphi, phi_t, dt, rotTau);

    this.el.style.transform = "translate3d("+(this.sx - this.wEff/2)+"px,"+this.sy+"px,0) rotate("+this.sphi+"rad)";
    if (this.y - this.hEff/2 > H + margin){ this.active=false; this.el.style.transform="translate3d(-99999px,-99999px,0)"; zCounts[this.layer]--; }
  };

  function Scheduler(){
    this.pool = Array.from({length:28}, ()=> new Flake());
    this.lastSpawn = -1e9;
    this.lastX=[];
  }
  Scheduler.prototype.activeX=function(){ var xs=[]; for(var i=0;i<this.pool.length;i++){ var f=this.pool[i]; if(f.active){ xs.push(f.sx); } } return xs; };
  Scheduler.prototype.spawnX=function(){
    var dmin = dminFrac*W, marginX=Math.max(12, marginXFrac*W);
    for(var tries=0; tries<28; tries++){
      var u = nextHalton();
      var x = marginX + (W-2*marginX)*u + rnd(-0.02*W, 0.02*W);
      var ok=true, xs=this.activeX();
      for(var i=0;i<xs.length;i++){ if (Math.abs(x-xs[i])<dmin){ ok=false; break; } }
      for(var j=0;j<this.lastX.length;j++){ if (Math.abs(x-this.lastX[j])<dmin*0.85){ ok=false; break; } }
      if(ok){ this.lastX.push(x); if(this.lastX.length>3)this.lastX.shift(); return x; }
    }
    return rnd(marginX, W-marginX);
  };
  Scheduler.prototype.chooseType=function(){
    var visTypes=new Set();
    for(var i=0;i<this.pool.length;i++){ var f=this.pool[i]; if(f.active && f.src) visTypes.add(f.src); }
    var bag=ICONS.slice(); for(var i=bag.length-1;i>0;i--){ var j=(Math.random()*(i+1))|0; var t=bag[i]; bag[i]=bag[j]; bag[j]=t; }
    for(var k=0;k<bag.length;k++){ if(!visTypes.has(bag[k])) return bag[k]; }
    return bag[0];
  };
  Scheduler.prototype.pickLayer=function(){
    // choose layer with minimal occupancy weighted
    var best=Z_LAYERS[0], bestScore=1e9;
    for (var i=0;i<Z_LAYERS.length;i++){
      var L = Z_LAYERS[i]; var score = (zCounts[L]+1)/Z_WEIGHTS[i];
      if (score < bestScore){ bestScore=score; best=L; }
    }
    zCounts[best]++;
    return best;
  };
  Scheduler.prototype.spawn=function(cls, time, opts){
    opts = opts || {};
    var forceCenter = !!opts.forceCenter;
    var f=null; for(var i=0;i<this.pool.length;i++){ if(!this.pool[i].active){ f=this.pool[i]; break; } }
    if(!f) return false;
    f.setSource(this.chooseType());
    f.v0 = pickSpeed(cls);
    f.xAnchor = forceCenter ? (W/2) : this.spawnX();
    f.layer = this.pickLayer();
    f.el.style.zIndex = String(10+f.layer);
    f.x = f.xAnchor;
    if (forceCenter){
      f.y = (H/2 - f.hEff/2);
    } else {
      f.y = (-HICON - margin);
    }
    f.sx = f.x; f.sy = f.y; f.vx = rnd(-3,3);
    f.tBorn = time; f.active=true;
    f.el.style.transform = "translate3d("+(f.sx - f.wEff/2)+"px,"+f.sy+"px,0) rotate(0rad)";
    this.lastSpawn = time;
    return true;
  };

  // Streams (oscillators) for slow/fast classes
  function Stream(kind, weight){
    this.kind=kind; this.weight=weight;
    this.phase = Math.random()*1.0;   // randomize start phase so two streams desync
    this.freq = 0;                    // updated from lambda
    this.nextDue = 0;
  }
  Stream.prototype.updateRate = function(lambda){ this.freq = Math.max(0.01, lambda*this.weight); };
  Stream.prototype.tick = function(dt){ this.phase += this.freq*dt; var spawns=0; while(this.phase>=1.0){ this.phase -= 1.0; spawns++; } return spawns; };

  // Bootstrap & globals
  var sched = new Scheduler();
  var Lpath = H + HICON + margin;
  var Tbar = Lpath / ((SLOW_MIN+SLOW_MAX+FAST_MIN+FAST_MAX)/4);
  var lambda = rho / Tbar; // target total rate
  var slowStream = new Stream("slow", P_SLOW);
  var fastStream = new Stream("fast", 1-P_SLOW);
  slowStream.updateRate(lambda);
  fastStream.updateRate(lambda);

  var g = {
    drift1: 0, drift2: 0, current: 0,
    n1: new LowNoise(driftFreq1),
    n2: new LowNoise(driftFreq2),
    wind: new LowNoise(windFreq)
  };

  // First flake: from top (offscreen), so зримо входит сверху
  var t0 = performance.now()/1000;
  sched.spawn("slow", t0, {forceCenter:true});

  var last = t0;
  function loop(){
    var now = performance.now()/1000;
    var dt = Math.min(0.05, Math.max(0.001, now - last)); last = now;

    // update river
    g.drift1 = g.n1.step(dt)*Math.PI;
    g.drift2 = g.n2.step(dt)*Math.PI;
    g.current = currentAmp * g.wind.step(dt);

    // update flakes
    var seen=0;
    for(var i=0;i<sched.pool.length;i++){
      var f = sched.pool[i]; var was=f.active;
      f.update(now, dt, g, {marginX: Math.max(12, marginXFrac*W)});
      if(f.active) seen++;
      if (was && !f.active){
        // update Tbar / lambda softly
        var Tview = Lpath / Math.max(1, f.v0);
        Tbar = 0.92*Tbar + 0.08*Tview;
        lambda = rho / Tbar;
        slowStream.updateRate(lambda);
        fastStream.updateRate(lambda);
      }
    }

    // Streams decide spawns (at most one per frame per stream)
    var toSpawnSlow = slowStream.tick(dt);
    var toSpawnFast = fastStream.tick(dt);

    // Temporal blue-noise guard: minimal distance in time and prevent double-spawn same frame if X is tight
    var minDt = 0.14;
    if (toSpawnSlow>0 && (now - sched.lastSpawn)>=minDt){ sched.spawn("slow", now, false); }
    if (toSpawnFast>0 && (now - sched.lastSpawn)>=minDt){ sched.spawn("fast", now, false); }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('resize', function(){
    W = stage.clientWidth|0; H = stage.clientHeight|0;
  });
})();