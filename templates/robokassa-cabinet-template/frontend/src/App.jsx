import React, { useEffect, useState } from "react";
import { createOrder, magicConsume, setPassword, login } from "./api.js";
import Modal from "./components/Modal.jsx";

function postRedirect(endpoint, params) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = endpoint;
  Object.entries(params).forEach(([k,v])=>{
    if (v === null || v === undefined || v === "") return;
    const i = document.createElement("input");
    i.type = "hidden"; i.name = k; i.value = v;
    form.appendChild(i);
  });
  document.body.appendChild(form);
  form.submit();
}

export default function App() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("990");
  const [status, setStatus] = useState("");
  const [pw, setPw] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalText, setModalText] = useState("");

  useEffect(()=>{
    const url = new URL(window.location.href);
    if (url.pathname === "/magic" && url.searchParams.get("token")) {
      const token = url.searchParams.get("token");
      magicConsume(token).then(r=>{
        setModalText(r.ok ? "Вход выполнен. Доступ выдан." : ("Ошибка: " + (r.error||"")));
        setModalOpen(true);
      });
    }
  },[]);

  async function onBuy() {
    setStatus("создаю счет...");
    const r = await createOrder(email, parseFloat(amount));
    if (r.error) { setStatus("ошибка: " + r.error); return; }
    setStatus("перенаправляю на оплату...");
    postRedirect(r.endpoint, r.params);
  }

  async function onSetPw() {
    const r = await setPassword(pw);
    setModalText(r.ok ? "Пароль установлен." : ("Ошибка: " + (r.error||"")));
    setModalOpen(true);
  }

  async function onLogin() {
    const r = await login(email, loginPw);
    setModalText(r.ok ? "Вход выполнен." : ("Ошибка: " + (r.error||"")));
    setModalOpen(true);
  }

  return (
    <div style={{fontFamily:"system-ui",maxWidth:520,margin:"24px auto",padding:12}}>
      <h2>Demo buy → Robokassa</h2>
      <label>Email</label><br/>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@mail.com" style={{width:"100%",padding:8,margin:"6px 0 12px"}} />
      <label>Amount</label><br/>
      <input value={amount} onChange={e=>setAmount(e.target.value)} style={{width:"100%",padding:8,margin:"6px 0 12px"}} />
      <button onClick={onBuy} style={{padding:"10px 14px"}}>Купить</button>
      <div style={{marginTop:10,color:"#666"}}>{status}</div>

      <hr style={{margin:"18px 0"}}/>

      <h3>Login</h3>
      <input type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)} placeholder="password" style={{width:"100%",padding:8,margin:"6px 0 8px"}} />
      <button onClick={onLogin} style={{padding:"8px 12px"}}>Войти</button>

      <hr style={{margin:"18px 0"}}/>

      <h3>Set password (after magic login)</h3>
      <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="new password" style={{width:"100%",padding:8,margin:"6px 0 8px"}} />
      <button onClick={onSetPw} style={{padding:"8px 12px"}}>Сохранить пароль</button>

      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title="Cabinet">
        {modalText}
      </Modal>
    </div>
  );
}
