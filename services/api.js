import axios from "axios";

const API_URL = "https://lifepilot-backend-haq2.onrender.com";


/* ===============================
   Get subscriptions (AI detection)
================================ */
export const getSubscriptions = async () => {
  try {
    const res = await axios.get(`${API_URL}/subscriptions`);
    return res.data;
  } catch (error) {
    console.error("Failed to fetch subscriptions", error);
    return [];
  }
};


/* ===============================
   Get all transactions
================================ */
export const getTransactions = async () => {
  try {
    const res = await axios.get(`${API_URL}/transactions`);
    return res.data;
  } catch (error) {
    console.error("Failed to fetch transactions", error);
    return [];
  }
};


/* ===============================
   Add single transaction
================================ */
export const addTransaction = async (merchant, amount) => {
  try {
    const res = await axios.post(
      `${API_URL}/add?merchant=${merchant}&amount=${amount}`
    );
    return res.data;
  } catch (error) {
    console.error("Add transaction failed", error);
    return null;
  }
};


/* ===============================
   Parse SMS text
================================ */
export const parseSMS = async (text) => {
  try {
    const res = await axios.post(`${API_URL}/parse-sms`, {
      text: text,
    });
    return res.data;
  } catch (error) {
    console.error("SMS parsing failed", error);
    return null;
  }
};

