import express from 'express';
const app = express();
app.get('/', (req, res) => res.json({ok: true}));
app.listen(4002, () => console.log('test server on 4002'));
