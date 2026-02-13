import axios from 'axios';

// Using your specific IPv4 address found via ipconfig
const API_URL = 'https://lifepilot-backend-haq2.onrender.com';

// Function 1: Gets the total savings and list of bills
export const getSubscriptionData = async () => {
  try {
    const response = await axios.get(`${API_URL}/detect`);
    return response.data;
  } catch (error) {
    console.error("Backend unreachable. Is FastAPI running?", error);
    return null;
  }
}; // <--- This bracket was missing or in the wrong place!

// Function 2: Sends the text message to the Python parser
export const parseSMS = async (text) => {
  try {
    const response = await axios.post(`${API_URL}/parse-sms`, { text: text });
    return response.data;
  } catch (error) {
    console.error("SMS Parsing failed", error);
    return null;
  }
};export const clearDatabase = async () => {
  try {
    const response = await axios.delete(`${API_URL}/clear`);
    return response.data;
  } catch (error) {
    console.error("Failed to clear database", error);
    return null;
  }
};