"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import {
  watchAppointments, addAppointment, setAppointmentStatus,
  watchInvoices, addInvoice, setInvoiceStatus,
} from "../lib/db";

const eur = (n) =>
  Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const daysLate = (inv) =>
  Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate + "T23:59:59").getTime()) / 864e5));

const APPT_LABEL = {
  a_envoyer: "Rappel à envoyer",
  envoye: "Rappel envoyé",
  confirme: "Confirmé par le client",
};

const dayLabel = (startsAt) =>
  new Date(startsAt).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function relanceText(inv) {
  const first = inv.client.split(" ")[0];
  const d = daysLate(inv);
  if (d > 14) {
    return `Bonjour ${first}, sauf erreur de ma part, la facture ${inv.ref} de ${eur(inv.amount)} reste impayée depuis ${d} jours. Pouvez-vous la régler cette semaine ? Vous pouvez payer en un clic : lien-de-paiement. Merci d'avance.`;
  }
  return `Bonjour ${first}, un petit rappel : la facture ${inv.ref} de ${eur(inv.amount)} est arrivée à échéance. Vous pouvez la régler en un clic : lien-de-paiement. Bonne journée !`;
}

export default function Relais() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("rdv");
  const [appts, setAppts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [draft, setDraft] = useState(null);
  const [toast, setToast] = useState("");
  const [apptForm, setApptForm] = useState({ startsAt: "", client: "", service: "" });
  const [invForm, setInvForm] = useState({ client: "", ref: "", amount: "", dueDate: "" });

  const say = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };
  const fail = () => say("Une erreur est survenue. Vérifiez votre connexion et réessayez.");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const stopA = watchAppointments(user.uid, setAppts, fail);
    const stopI = watchInvoices(user.uid, setInvoices, fail);
    return () => {
      stopA();
      stopI();
    };
  }, [user]);

  const login = () => signInWithPopup(auth, googleProvider).catch(() => say("Connexion impossible"));

  const sendReminder = async (a) => {
    try {
      await setAppointmentStatus(user.uid, a.id, "envoye");
      say(`Rappel envoyé à ${a.client}`);
    } catch { fail(); }
  };

  const confirmAppt = (a) => setAppointmentStatus(user.uid, a.id, "confirme").catch(fail);

  const submitAppt = async () => {
    const { startsAt, client, service } = apptForm;
    if (!startsAt || !client.trim() || !service.trim()) return say("Renseignez la date, le client et le service");
    try {
      await addAppointment(user.uid, { startsAt, client: client.trim(), service: service.trim() });
      setApptForm({ startsAt: "", client: "", service: "" });
      say("Rendez-vous ajouté");
    } catch { fail(); }
  };

  const submitInvoice = async () => {
    const { client, ref, amount, dueDate } = invForm;
    if (!client.trim() || !ref.trim() || !(Number(amount) > 0) || !dueDate)
      return say("Renseignez le client, la référence, le montant et l'échéance");
    try {
      await addInvoice(user.uid, { client: client.trim(), ref: ref.trim(), amount: Number(amount), dueDate });
      setInvForm({ client: "", ref: "", amount: "", dueDate: "" });
      say("Facture ajoutée");
    } catch { fail(); }
  };

  const sendRelance = async () => {
    const inv = invoices.find((i) => i.id === draft.id);
    try {
      await setInvoiceStatus(user.uid, inv.id, "relance");
      setDraft(null);
      say(`Relance envoyée à ${inv.client}`);
    } catch { fail(); }
  };

  const markPaid = async (inv) => {
    try {
      await setInvoiceStatus(user.uid, inv.id, "paye");
      say(`Facture ${inv.ref} marquée payée`);
    } catch { fail(); }
  };

  if (!ready) return <div className="rl"><p className="empty">Chargement…</p></div>;

  if (!user) {
    return (
      <div className="rl">
        <header className="rl-head">
          <div className="rl-brand">Relais</div>
          <p className="rl-sentence">Moins de rendez-vous manqués, plus de factures payées.</p>
        </header>
        <div className="auth">
          <button className="btn" onClick={login}>Se connecter avec Google</button>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }

  const open = invoices.filter((i) => i.status !== "paye");
  const toConfirm = appts.filter((a) => a.status !== "confirme").length;
  const owed = open.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="rl">
      <header className="rl-head">
        <div className="topline">
          <div className="rl-brand">Relais</div>
          <button className="linkbtn" onClick={() => signOut(auth)}>Se déconnecter</button>
        </div>
        <p className="rl-sentence">
          {toConfirm > 0
            ? `${toConfirm} rendez-vous attendent une confirmation.`
            : "Tous les rendez-vous sont confirmés."}{" "}
          {owed > 0 ? `${eur(owed)} restent à récupérer.` : "Aucune facture en attente."}
        </p>
      </header>

      <nav className="rl-tabs" aria-label="Sections">
        <button className={tab === "rdv" ? "on" : ""} onClick={() => setTab("rdv")}>Rendez-vous</button>
        <button className={tab === "fac" ? "on" : ""} onClick={() => setTab("fac")}>Factures ({open.length})</button>
      </nav>

      {tab === "rdv" && (
        <main className="rl-sheet">
          {appts.length === 0 ? (
            <p className="empty">Aucun rendez-vous. Ajoutez le premier ci-dessous.</p>
          ) : (
            <ul className="rl-list">
              {appts.map((a) => (
                <li key={a.id} className={`row s-${a.status}`}>
                  <div className="time">
                    {a.startsAt.slice(11, 16)}
                    <small>{dayLabel(a.startsAt)}</small>
                  </div>
                  <div className="who">
                    <strong>{a.client}</strong>
                    <span>{a.service}</span>
                    <em className="state">{APPT_LABEL[a.status]}</em>
                  </div>
                  <div className="act">
                    {a.status === "a_envoyer" && <button className="btn" onClick={() => sendReminder(a)}>Envoyer le rappel</button>}
                    {a.status === "envoye" && <button className="btn ghost" onClick={() => confirmAppt(a)}>Le client a confirmé</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="add">
            <h2>Ajouter un rendez-vous</h2>
            <div className="fields">
              <label>Date et heure
                <input type="datetime-local" value={apptForm.startsAt} onChange={(e) => setApptForm({ ...apptForm, startsAt: e.target.value })} />
              </label>
              <label>Client
                <input value={apptForm.client} onChange={(e) => setApptForm({ ...apptForm, client: e.target.value })} placeholder="Nom du client" />
              </label>
              <label>Service
                <input value={apptForm.service} onChange={(e) => setApptForm({ ...apptForm, service: e.target.value })} placeholder="Ce qui est prévu" />
              </label>
            </div>
            <button className="btn" onClick={submitAppt}>Ajouter le rendez-vous</button>
          </div>
        </main>
      )}

      {tab === "fac" && (
        <main className="rl-sheet">
          {open.length === 0 ? (
            <p className="empty">Aucune facture en attente. Ajoutez-en une ci-dessous.</p>
          ) : (
            <ul className="rl-list">
              {open.map((inv) => {
                const d = daysLate(inv);
                return (
                  <li key={inv.id} className={`row ${d > 14 ? "s-late" : "s-due"}`}>
                    <div className="time amount">{eur(inv.amount)}</div>
                    <div className="who">
                      <strong>{inv.client}</strong>
                      <span>Facture {inv.ref}</span>
                      <em className="state">
                        {d > 0 ? `${d} jours de retard` : "Pas encore échue"}
                        {inv.status === "relance" ? ", déjà relancée" : ""}
                      </em>
                    </div>
                    <div className="act">
                      <button className="btn" onClick={() => setDraft({ id: inv.id, text: relanceText(inv) })}>
                        {inv.status === "relance" ? "Relancer à nouveau" : "Relancer"}
                      </button>
                      <button className="btn ghost" onClick={() => markPaid(inv)}>Marquer payée</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {draft && (
            <div className="draft">
              <h2>Message de relance</h2>
              <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={5} />
              <div className="draft-act">
                <button className="btn" onClick={sendRelance}>Envoyer la relance</button>
                <button className="btn ghost" onClick={() => setDraft(null)}>Annuler</button>
              </div>
            </div>
          )}

          <div className="add">
            <h2>Ajouter une facture</h2>
            <div className="fields four">
              <label>Client
                <input value={invForm.client} onChange={(e) => setInvForm({ ...invForm, client: e.target.value })} placeholder="Nom du client" />
              </label>
              <label>Référence
                <input value={invForm.ref} onChange={(e) => setInvForm({ ...invForm, ref: e.target.value })} placeholder="F-2026-050" />
              </label>
              <label>Montant en euros
                <input type="number" min="0" inputMode="decimal" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} />
              </label>
              <label>Date d'échéance
                <input type="date" value={invForm.dueDate} onChange={(e) => setInvForm({ ...invForm, dueDate: e.target.value })} />
              </label>
            </div>
            <button className="btn" onClick={submitInvoice}>Ajouter la facture</button>
          </div>
        </main>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
