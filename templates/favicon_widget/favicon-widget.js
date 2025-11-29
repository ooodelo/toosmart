(function(){
  const root=document.getElementById('favicon-widget');
  const state={files:{}, manifest:{
    name:"Site",
    short_name:"Site",
    start_url:"/",
    display:"standalone",
    background_color:"#ffffff",
    theme_color:"#ffffff",
    icons:[]
  }};
  function render(){
    root.innerHTML="";
    const s1=document.createElement('div');s1.className="fw-section";
    s1.innerHTML="<h3>Статус иконок</h3>";
    const ul=document.createElement('ul');ul.className="fw-list";
    const req=["favicon.svg","favicon.ico","favicon-16x16.png","favicon-32x32.png","apple-touch-icon.png","android-chrome-192x192.png","android-chrome-512x512.png"];
    req.forEach(f=>{
      const li=document.createElement('li');
      li.textContent=f+" — "+(state.files[f]?"OK":"нет");
      ul.appendChild(li);
    });
    s1.appendChild(ul);
    root.appendChild(s1);

    const s2=document.createElement('div');s2.className="fw-section";
    s2.innerHTML="<h3>Загрузка файлов</h3>";
    const up=document.createElement('div');up.className="fw-upload";
    up.textContent="Перетащите файлы сюда";
    up.ondragover=e=>{e.preventDefault();};
    up.ondrop=e=>{
      e.preventDefault();
      for(const file of e.dataTransfer.files){
        state.files[file.name]=true;
      }
      render();
    };
    s2.appendChild(up);
    root.appendChild(s2);

    const s3=document.createElement('div');s3.className="fw-section";
    s3.innerHTML="<h3>HTML-код для вставки</h3>";
    const code=document.createElement('div');code.className="fw-code";
    code.textContent=`<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon-32x32.png" sizes="32x32">
<link rel="alternate icon" href="/favicon-16x16.png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="${state.manifest.theme_color}">`;
    s3.appendChild(code);
    root.appendChild(s3);

    const s4=document.createElement('div');s4.className="fw-section";
    s4.innerHTML="<h3>Webmanifest</h3>";
    const manifestBox=document.createElement('div');manifestBox.className="fw-code";
    manifestBox.textContent=JSON.stringify(state.manifest,null,2);
    s4.appendChild(manifestBox);
    root.appendChild(s4);
  }
  render();
})();