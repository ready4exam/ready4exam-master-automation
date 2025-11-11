export async function fetchQuestions(topic, difficulty) {
  const { supabase } = getClients();
  if (!supabase) throw new Error("Supabase not initialized.");

  const table = `${topic.toLowerCase()}_quiz`;   // ✅ same as class 9 logic
  console.log("[API] Fetching from table:", table);

  const { data, error } = await supabase
    .from(table)
    .select(`
      id, question_text, question_type, scenario_reason_text,
      option_a, option_b, option_c, option_d, correct_answer_key
    `)
    .eq("difficulty", difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase());

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No questions found.");
  return data;
}
