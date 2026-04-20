import type { APIRoute } from 'astro';

export const ALL: APIRoute = async () => {
  const url = 'https://tripcanvas-cms.academyt.workers.dev/api/posts';
  
  try {
    const response = await fetch(url);
    const status = response.status;
    const statusText = response.statusText;
    const body = await response.text();
    
    return new Response(JSON.stringify({
      status,
      statusText,
      bodyLength: body.length,
      bodyPreview: body.slice(0, 200),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: String(error),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
