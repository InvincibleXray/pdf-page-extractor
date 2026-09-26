import { pdfToPdfLibCoords } from '../src/utils/coordinateMapper.js';

// Test coordinate conversion to pdf-lib bottom-left origin
const pageHeight = 842;
const x = 50;
const y = 100;
const width = 200;
const height = 40;

const mapped = pdfToPdfLibCoords(x, y, width, height, pageHeight);

if (mapped.x === 50 && mapped.y === (842 - 100 - 40) && mapped.y === 702 && mapped.width === 200 && mapped.height === 40) {
  console.log('Coordinate mapping verification PASSED: (x: 50, y: 702, w: 200, h: 40)');
} else {
  console.error('Coordinate mapping FAILED:', mapped);
  process.exit(1);
}
