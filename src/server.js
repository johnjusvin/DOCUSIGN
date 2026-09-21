import { app } from './http/app.js';
import { config } from './config.js';

const port = config.port || process.env.PORT || 4000;
const host = config.host || '127.0.0.1';

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ ok: false, error: (err && err.message) || 'Internal server error' });
});

app.listen(port, host, () => {
  console.log(`REDITUS SIGN running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});

export { app };
