const multer = require('multer');

// Use memory storage — no disk writes needed on Vercel
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Helper to escape XML special chars
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert a TSV line: tabs → 8 spaces, then escape XML, keep \r at end as &#13;
function lineToXmlContent(rawLine) {
  // rawLine may end with \r — preserve as &#13; like the sample file
  const hasCR = rawLine.endsWith('\r');
  const line   = hasCR ? rawLine.slice(0, -1) : rawLine;

  // Replace tabs with 8 spaces (matching the sample XML output)
  const spaced = line.replace(/\t/g, '        ');
  const escaped = escapeXml(spaced);
  return escaped + (hasCR ? '&#13;' : '');
}

function txtToXml(txtBuffer) {
  // Decode as latin-1 / binary to preserve every byte (matches Amazon export encoding)
  const text = txtBuffer.toString('binary');

  // Split on \n, keeping the \r if present (Windows line endings)
  const rawLines = text.split('\n');

  // Remove trailing empty line if file ends with \n
  if (rawLines[rawLines.length - 1].trim() === '') rawLines.pop();

  const paras = rawLines
    .map(line => `  <para>${lineToXmlContent(line)}</para>`)
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE article PUBLIC "-//OASIS//DTD DocBook XML V4.1.2//EN" ' +
    '"http://www.oasis-open.org/docbook/xml/4.1.2/docbookx.dtd">\n' +
    '<article lang="">\n' +
    paras + '\n' +
    '</article>\n'
  );
}

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Erro no upload: ' + err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const originalName = req.file.originalname || 'pedidos';
    const baseName = originalName.replace(/\.txt$/i, '');

    let xmlContent;
    try {
      xmlContent = txtToXml(req.file.buffer);
    } catch (e) {
      return res.status(500).json({ error: 'Falha na conversão: ' + e.message });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xml"`);
    res.send(xmlContent);
  });
};
