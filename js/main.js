// theme first, so the page never flashes the wrong colours
(function(){
  var t=localStorage.getItem('qr-theme');
  if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  document.documentElement.setAttribute('data-theme',t);
})();

// history store, shared by every page (saved in this browser only)
(function(){
  var KEY='qr-history',MAX=50;
  function load(){try{return JSON.parse(localStorage.getItem(KEY))||[];}catch(e){return[];}}
  function store(a){try{localStorage.setItem(KEY,JSON.stringify(a));}catch(e){}}
  window.QRHistory={
    all:load,
    add:function(type,text){
      text=(text||'').trim();if(!text)return;
      var a=load().filter(function(i){return !(i.type===type&&i.text===text);});
      a.unshift({type:type,text:text,time:Date.now()});
      store(a.slice(0,MAX));
      if(this.onChange)this.onChange();
    },
    remove:function(type,text){
      store(load().filter(function(i){return !(i.type===type&&i.text===text);}));
      if(this.onChange)this.onChange();
    },
    clear:function(){store([]);if(this.onChange)this.onChange();}
  };
})();

function toLink(s){
  s=(s||'').trim();
  if(!s||/\s/.test(s))return null;
  try{var u=new URL(s);return(u.protocol==='http:'||u.protocol==='https:')?u.href:null;}catch(e){}
  if(/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([\/?#]\S*)?$/i.test(s)){
    try{return new URL('https://'+s).href;}catch(e){}
  }
  return null;
}

document.addEventListener('DOMContentLoaded',function(){
  var page=document.body.dataset.page;
  var name=localStorage.getItem('qr-name');

  // name guard: every page except the welcome page needs a saved name
  if(page!=='welcome'&&!name){location.replace('index.html');return;}

  // header
  var header=document.getElementById('site-header');
  var links=[['home','Home','home.html'],['generator','Generator','generator.html'],['scanner','Scanner','scanner.html']];
  var nav=page==='welcome'?'':'<nav aria-label="Main">'+links.map(function(l){
    return '<a href="'+l[2]+'"'+(l[0]===page?' class="active" aria-current="page"':'')+'>'+l[1]+'</a>';
  }).join('')+'</nav>';
  header.innerHTML=(page==='welcome'?'':'<a class="brand" href="home.html">QR Studio</a>')+nav+
    '<div class="header-tools">'+
    (page==='welcome'?'':'<button class="theme-btn" id="histBtn" aria-label="Open history" aria-expanded="false"><i class="fa-solid fa-clock-rotate-left"></i></button>')+
    '<button class="theme-btn" id="themeBtn" aria-label="Toggle light or dark mode"></button></div>';

  var btn=document.getElementById('themeBtn');
  function paint(){btn.innerHTML=document.documentElement.dataset.theme==='dark'?'<i class="fa-solid fa-sun"></i>':'<i class="fa-solid fa-moon"></i>';}
  paint();
  btn.addEventListener('click',function(){
    var next=document.documentElement.dataset.theme==='dark'?'light':'dark';
    document.documentElement.dataset.theme=next;
    localStorage.setItem('qr-theme',next);paint();
  });

  if(page!=='welcome')buildHistory();

  // cursor bubble
  var b=document.createElement('div');b.id='bubble';document.body.appendChild(b);
  var sel='a,button,input,textarea,label,.drop,[role=button]';
  document.addEventListener('mousemove',function(e){
    b.style.opacity=1;
    b.classList.toggle('grow',!!e.target.closest(sel));
    b.style.setProperty('--x',e.clientX+'px');b.style.setProperty('--y',e.clientY+'px');
    b.style.transform='translate('+e.clientX+'px,'+e.clientY+'px) scale('+(b.classList.contains('grow')?2:1)+')';
  });
  document.addEventListener('mouseleave',function(){b.style.opacity=0;});

  // history drawer
  function buildHistory(){
    var tab='all';
    var back=document.createElement('div');back.className='hist-back';
    var d=document.createElement('aside');d.className='history';d.setAttribute('aria-label','History');
    d.innerHTML='<div class="hist-head"><h2>History</h2><button class="theme-btn" id="histClose" aria-label="Close history"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="hist-tabs" role="tablist">'+
      '<button data-tab="all" class="on">All</button><button data-tab="generated">Generated</button><button data-tab="scanned">Scanned</button></div>'+
      '<ul class="hist-list" id="histList"></ul>'+
      '<div class="hist-foot"><span id="histMsg" role="status"></span><button class="btn ghost" id="histClear" type="button">Clear all</button></div>';
    document.body.appendChild(back);document.body.appendChild(d);

    var list=d.querySelector('#histList'),hmsg=d.querySelector('#histMsg'),openBtn=document.getElementById('histBtn');
    function open(){d.classList.add('open');back.classList.add('open');openBtn.setAttribute('aria-expanded','true');render();d.querySelector('#histClose').focus();}
    function close(){d.classList.remove('open');back.classList.remove('open');openBtn.setAttribute('aria-expanded','false');openBtn.focus();}
    openBtn.addEventListener('click',open);
    d.querySelector('#histClose').addEventListener('click',close);
    back.addEventListener('click',close);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&d.classList.contains('open'))close();});

    d.querySelectorAll('.hist-tabs button').forEach(function(t){
      t.addEventListener('click',function(){
        tab=t.dataset.tab;
        d.querySelectorAll('.hist-tabs button').forEach(function(x){x.classList.toggle('on',x===t);});
        render();
      });
    });
    d.querySelector('#histClear').addEventListener('click',function(){
      if(QRHistory.all().length&&confirm('Clear all history?'))QRHistory.clear();
    });

    function when(t){return new Date(t).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
    function iconBtn(icon,label,fn){
      var x=document.createElement('button');x.type='button';x.className='hist-icon';
      x.setAttribute('aria-label',label);x.title=label;x.innerHTML='<i class="fa-solid '+icon+'"></i>';
      x.addEventListener('click',fn);return x;
    }

    // Trigger visual toast badge & change icon momentarily
    function showCopyFeedback(targetBtn, text){
      navigator.clipboard.writeText(text).then(function(){
        hmsg.textContent='Copied.';
        if(!targetBtn) return;
        var icon = targetBtn.querySelector('i');
        if(icon){
          icon.className = 'fa-solid fa-check';
          targetBtn.style.color = 'var(--ok)';
        }

        // Show floating badge
        var badge = document.createElement('div');
        badge.className = 'hist-copied-badge';
        badge.textContent = 'Copied! ✓';
        targetBtn.parentElement.appendChild(badge);

        setTimeout(function(){
          if(icon){
            icon.className = 'fa-solid fa-copy';
            targetBtn.style.color = '';
          }
          if(badge.parentElement) badge.remove();
        }, 1500);
      }, function(){
        hmsg.textContent='Could not copy.';
      });
    }

    function render(){
      var items=QRHistory.all().filter(function(i){return tab==='all'||i.type===tab;});
      list.innerHTML='';hmsg.textContent='';
      if(!items.length){
        var p=document.createElement('li');p.className='hist-empty';
        p.textContent='Nothing here yet. Codes you generate or scan will show up here.';
        list.appendChild(p);return;
      }
      items.forEach(function(i){
        var li=document.createElement('li');li.className='hist-item';
        var main=document.createElement('button');main.type='button';main.className='hist-main';
        main.title=page==='generator'?'Generate this again':'Copy';
        var ic=document.createElement('i');ic.className='fa-solid '+(i.type==='generated'?'fa-qrcode':'fa-camera');
        var tx=document.createElement('span');tx.className='hist-text';tx.textContent=i.text;
        var tm=document.createElement('span');tm.className='hist-time';tm.textContent=(i.type==='generated'?'Generated · ':'Scanned · ')+when(i.time);
        main.appendChild(ic);main.appendChild(tx);main.appendChild(tm);
        
        var acts=document.createElement('div');acts.className='hist-actions';
        var copyBtnEl = iconBtn('fa-copy','Copy',function(e){
          e.stopPropagation();
          showCopyFeedback(copyBtnEl, i.text);
        });

        main.addEventListener('click',function(){
          if(page==='generator'){
            document.dispatchEvent(new CustomEvent('qr-history-pick',{detail:{text:i.text}}));close();
          }else{
            showCopyFeedback(copyBtnEl, i.text);
          }
        });

        acts.appendChild(copyBtnEl);
        var l=toLink(i.text);
        if(l)acts.appendChild(iconBtn('fa-arrow-up-right-from-square','Open website',function(e){
          e.stopPropagation();
          window.open(l,'_blank','noopener');
        }));
        acts.appendChild(iconBtn('fa-trash','Delete',function(e){
          e.stopPropagation();
          QRHistory.remove(i.type,i.text);
        }));

        li.appendChild(main);li.appendChild(acts);list.appendChild(li);
      });
    }

    QRHistory.onChange=render;
  }
});