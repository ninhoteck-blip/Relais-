import {
  collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const col = (uid, name) => collection(db, "users", uid, name);
const ref = (uid, name, id) => doc(db, "users", uid, name, id);
const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export const watchAppointments = (uid, onData, onError) =>
  onSnapshot(query(col(uid, "appointments"), orderBy("startsAt")), (s) => onData(toList(s)), onError);

export const addAppointment = (uid, { startsAt, client, service }) =>
  addDoc(col(uid, "appointments"), { startsAt, client, service, status: "a_envoyer", createdAt: serverTimestamp() });

export const setAppointmentStatus = (uid, id, status) =>
  updateDoc(ref(uid, "appointments", id), { status });

export const watchInvoices = (uid, onData, onError) =>
  onSnapshot(query(col(uid, "invoices"), orderBy("dueDate")), (s) => onData(toList(s)), onError);

export const addInvoice = (uid, { client, ref: number, amount, dueDate }) =>
  addDoc(col(uid, "invoices"), { client, ref: number, amount, dueDate, status: "due", createdAt: serverTimestamp() });

export const setInvoiceStatus = (uid, id, status) =>
  updateDoc(ref(uid, "invoices", id), { status });
