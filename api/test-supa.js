

export default async function handler(req, res) {
  try {
    const SUPA_KEY = process.env.SUPABASE_PARSED_KEY;

    const url =
      "https://zqhzekzilalbszpfwxhn.supabase.co/rest/v1/relations_functions_quiz?select=*";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    res.status(response.status).json({
      status: response.status,
      ok: response.ok,
      data,
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
