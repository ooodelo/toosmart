
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// mobile menu
const toggle = $('.nav-toggle');
const navList = $('#nav-list');
if (toggle && navList){
  toggle.addEventListener('click', () => {
    const open = navList.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

// modals
function openModal(modal){
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeModal(modal){
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}

$$('[data-modal]').forEach(a=>{
  a.addEventListener('click', e=>{
    const id = a.getAttribute('href');
    if (!id || !id.startsWith('#')) return;
    const modal = $(id);
    if (!modal) return;
    e.preventDefault();
    openModal(modal);
  });
});

$$('.modal').forEach(modal=>{
  modal.addEventListener('click', e=>{
    if (e.target.matches('[data-close]')) closeModal(modal);
  });
  document.addEventListener('keydown', e=>{
    if (e.key === 'Escape' && modal.getAttribute('aria-hidden')==='false'){
      closeModal(modal);
    }
  });
});
