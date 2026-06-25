// netlify/functions/review.js
//
// Server-side proxy for the Duty Desk fiduciary-review tool.
// Holds the Anthropic API key safely (via Netlify env var ANTHROPIC_API_KEY)
// so it never appears in the browser-facing HTML/JS.
//
// The front-end calls POST /.netlify/functions/review
// with JSON body: { system: "...", userPrompt: "..." }
// and gets back: { verdict, verdict_label, what_the_duty_requires, assessment_of_response, the_fix }

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify site settings." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  const { system, userPrompt } = payload;
  if (!system || !userPrompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing system or userPrompt in request" }),
    };
  }

  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Upstream API error", status: anthropicResponse.status }),
      };
    }

    const data = await anthropicResponse.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");

    if (!textBlock) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "No text content in model response" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textBlock.text }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal error calling Anthropic API" }),
    };
  }
};
