import { useMemo } from 'react';
import { qrMatrix } from '../domain/qr';

/** QR-Code als SVG mit hellem Rand, damit Kameras ihn auch im Dark Mode lesen. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const matrix = useMemo(() => qrMatrix(text), [text]);
  const size = matrix.length;
  const quiet = 4;
  const path = matrix
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : '')))
    .join('');
  return (
    <svg className="qr" viewBox={`0 0 ${size + 2 * quiet} ${size + 2 * quiet}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
