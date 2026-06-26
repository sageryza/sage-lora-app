// Whitelisted models -> trigger word. Add new LoRAs here after training.
const MODELS = {
  gosh: { model: 'sageryza/gosh', trigger: 'gosh' },
  hoonie: { model: 'sageryza/hoonie', trigger: 'HOONIE', style: 'linocut relief print, white background', steps: 40 },
};
const DEFAULT_MODEL = 'hoonie';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, model: modelKey } = req.body;
  const API_TOKEN = process.env.REPLICATE_API_TOKEN;

  const selected = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  const { model: MODEL, trigger: TRIGGER, style: STYLE, steps: STEPS } = selected;

  let fullPrompt = prompt.includes(TRIGGER) ? prompt : `${prompt}, ${TRIGGER}`;
  if (STYLE) fullPrompt = `${fullPrompt}, ${STYLE}`;

  try {
    // Get model version
    const modelRes = await fetch(`https://api.replicate.com/v1/models/${MODEL}`, {
      headers: { 'Authorization': `Token ${API_TOKEN}` }
    });
    const modelData = await modelRes.json();
    if (!modelData.latest_version) {
      return res.status(503).json({ error: `Model ${MODEL} has no trained version yet` });
    }
    const version = modelData.latest_version.id;

    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version,
        input: { prompt: fullPrompt, num_inference_steps: STEPS || 40 }
      })
    });

    const prediction = await createRes.json();

    // Poll for result
    let current = prediction;
    while (current.status !== 'succeeded' && current.status !== 'failed') {
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${current.id}`, {
        headers: { 'Authorization': `Token ${API_TOKEN}` }
      });
      current = await pollRes.json();
    }

    if (current.status === 'succeeded') {
      return res.status(200).json({ image: current.output[0] });
    } else {
      return res.status(500).json({ error: current.error || 'Generation failed' });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
