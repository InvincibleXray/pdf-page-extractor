import {
  PDFDocument,
  rgb,
  degrees,
  PDFName,
  PDFString,
  PDFDict,
  PDFArray,
  PDFRawStream,
} from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export const FIXTURES_DIR = path.resolve('test-fixtures/phase5b');
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// Minimal 1x1 transparent PNG / solid PNG base64 for image embedding
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export async function generateAllFixtures() {
  const fixtures = [];

  // ==========================================
  // FIXTURE A: Normal Selectable Text
  // ==========================================
  {
    const id = 'FIXTURE_A_SELECTABLE';
    const canary = 'REDACTION_CANARY_A_7F91X';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica-Bold');
    const fontNorm = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Customer Record Statement', { x: 50, y: 780, size: 16, font });
    page.drawText(`Secret Identifier: ${canary}`, { x: 50, y: 720, size: 14, font: fontNorm });
    page.drawText('Standard Public Notes', { x: 50, y: 660, size: 12, font: fontNorm });
    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Normal Selectable Text',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 740, width: 350, height: 30, originalText: canary },
      ],
      description: 'Standard single-line text in PDF content stream',
    });
  }

  // ==========================================
  // FIXTURE B: Partial Text
  // ==========================================
  {
    const id = 'FIXTURE_B_PARTIAL';
    const canary = 'SECRET_CANARY_B_PARTIAL_99214';
    const fullText = `PREFIX_${canary}_SUFFIX`;
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText(fullText, { x: 50, y: 720, size: 12, font });
    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Partial Text Redaction',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 95, y: 842 - 735, width: 220, height: 25, originalText: canary },
      ],
      description: 'Canary embedded within a single contiguous text token',
    });
  }

  // ==========================================
  // FIXTURE C: Rotated Text
  // ==========================================
  {
    const id = 'FIXTURE_C_ROTATED_TEXT';
    const canary = 'SECRET_CANARY_C_ROT45_18274';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica-Bold');
    const page = doc.addPage([595, 842]);
    page.drawText(canary, {
      x: 100,
      y: 500,
      size: 14,
      font,
      rotate: degrees(45),
    });
    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Rotated Text',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 80, y: 842 - 700, width: 250, height: 250, originalText: canary },
      ],
      description: 'Text rendered with a 45-degree rotation matrix',
    });
  }

  // ==========================================
  // FIXTURE D: Text Inside Image
  // ==========================================
  {
    const id = 'FIXTURE_D_TEXT_IN_IMAGE';
    const canary = 'SECRET_IMAGE_CANARY_D_4819';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Embedded Image Badge', { x: 50, y: 780, size: 14, font });

    // Embed small image
    const imgBytes = Buffer.from(TINY_PNG_BASE64, 'base64');
    const img = await doc.embedPng(imgBytes);
    page.drawImage(img, { x: 50, y: 600, width: 200, height: 100 });
    // Also place the canary indicator next to or over image region
    page.drawText(`[Embedded Badge with ${canary}]`, { x: 50, y: 580, size: 11, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Text Inside Image',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 710, width: 220, height: 140, originalText: canary },
      ],
      description: 'Image and embedded text token in image area',
    });
  }

  // ==========================================
  // FIXTURE E: Image XObject
  // ==========================================
  {
    const id = 'FIXTURE_E_XOBJECT_IMAGE';
    const canary = 'SECRET_XOBJ_CANARY_E_9912';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);

    const imgBytes = Buffer.from(TINY_PNG_BASE64, 'base64');
    const img = await doc.embedPng(imgBytes);
    page.drawImage(img, { x: 100, y: 500, width: 150, height: 150 });

    const font = await doc.embedFont('Helvetica');
    page.drawText(`XObject Label: ${canary}`, { x: 100, y: 470, size: 12, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Image XObject Destruction',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 90, y: 842 - 660, width: 250, height: 200, originalText: canary },
      ],
      description: 'Independent image XObject in page resources',
    });
  }

  // ==========================================
  // FIXTURE F: Vector Graphics
  // ==========================================
  {
    const id = 'FIXTURE_F_VECTOR';
    const canary = 'CANARY_F_VEC_SECRET_SHAPE';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText(`Vector Shape Confidential (${canary})`, { x: 50, y: 750, size: 12, font });
    // Complex vector geometry
    page.drawRectangle({
      x: 50,
      y: 600,
      width: 150,
      height: 100,
      borderColor: rgb(0.8, 0.1, 0.1),
      borderWidth: 3,
      color: rgb(0.9, 0.9, 1.0),
    });
    page.drawEllipse({
      x: 125,
      y: 650,
      xScale: 40,
      yScale: 25,
      borderColor: rgb(0.1, 0.7, 0.2),
      borderWidth: 2,
    });
    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Vector Graphics',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 40, y: 842 - 765, width: 300, height: 180, originalText: canary },
      ],
      description: 'Vector paths and text in PDF stream',
    });
  }

  // ==========================================
  // FIXTURE G: Hidden/Invisible Text (renderMode 3)
  // ==========================================
  {
    const id = 'FIXTURE_G_HIDDEN_TEXT';
    const canary = 'SECRET_CANARY_G_TR3_INVISIBLE';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    // Draw visible marker
    page.drawText('Page with OCR / Invisible Text Layer', { x: 50, y: 780, size: 14, font });

    // Write text with invisible renderMode 3 via content stream
    const contentStream = doc.context.flateStream(
      `BT /F1 12 Tf 3 Tr 50 700 Td (${canary}) Tj 0 Tr ET`,
      {}
    );
    const streamRef = doc.context.register(contentStream);
    (page.node.get(PDFName.of('Contents')) ).push(streamRef);

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Hidden / Invisible Text (RenderMode 3)',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 40, y: 842 - 720, width: 350, height: 40, originalText: canary },
      ],
      description: 'Text rendered with 3 Tr (neither fill nor stroke text)',
    });
  }

  // ==========================================
  // FIXTURE H: White Text on White Background
  // ==========================================
  {
    const id = 'FIXTURE_H_WHITE_ON_WHITE';
    const canary = 'SECRET_CANARY_H_WHITE_ON_WHITE';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Visible Document Header', { x: 50, y: 780, size: 14, font });
    // White text on white page
    page.drawText(canary, {
      x: 50,
      y: 720,
      size: 12,
      font,
      color: rgb(1, 1, 1),
    });
    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'White Text on White Background',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 735, width: 350, height: 30, originalText: canary },
      ],
      description: 'Text drawn with RGB(1,1,1) on white background',
    });
  }

  // ==========================================
  // FIXTURE I: Clipped Text
  // ==========================================
  {
    const id = 'FIXTURE_I_CLIPPED';
    const canary = 'SECRET_CANARY_I_CLIPPED_9021';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Clipped Text Operator', { x: 50, y: 780, size: 14, font });

    // Clipping path in content stream: q 50 690 10 10 re W n (clips text to 10x10) BT ... ET Q
    const contentStream = doc.context.flateStream(
      `q 50 690 300 30 re W n BT /F1 12 Tf 50 700 Td (${canary}) Tj ET Q`,
      {}
    );
    const streamRef = doc.context.register(contentStream);
    (page.node.get(PDFName.of('Contents')) ).push(streamRef);

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Clipped Text',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 725, width: 350, height: 35, originalText: canary },
      ],
      description: 'Text enclosed within an explicit PDF clipping path (W n)',
    });
  }

  // ==========================================
  // FIXTURE J: Text Behind Another Object
  // ==========================================
  {
    const id = 'FIXTURE_J_BEHIND_OBJECT';
    const canary = 'SECRET_CANARY_J_ZORDER_BEHIND';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    // 1. Draw text first (lower Z-order)
    page.drawText(canary, { x: 50, y: 700, size: 14, font, color: rgb(0, 0, 0) });
    // 2. Cover text with opaque solid vector rectangle
    page.drawRectangle({
      x: 45,
      y: 690,
      width: 320,
      height: 30,
      color: rgb(0.2, 0.4, 0.8),
    });
    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Text Behind Object (Z-order Occlusion)',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 40, y: 842 - 725, width: 330, height: 40, originalText: canary },
      ],
      description: 'Text visually occluded by a subsequent opaque vector fill',
    });
  }

  // ==========================================
  // FIXTURE K: Annotation Containing Secret (Popup / Text annot)
  // ==========================================
  {
    const id = 'FIXTURE_K_ANNOT_SECRET';
    const canary = 'SECRET_CANARY_K_ANNOT_TEXT';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Native Sticky Note Annotation', { x: 50, y: 780, size: 14, font });

    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [50, 700, 80, 730],
      Contents: PDFString.of(canary),
      Name: 'Comment',
    });
    const annotRef = doc.context.register(annotDict);
    page.node.set(PDFName.of('Annots'), doc.context.obj([annotRef]));

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Text Annotation Secret',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 740, width: 100, height: 50, originalText: canary },
      ],
      description: 'Native PDF sticky-note annotation containing canary in /Contents',
    });
  }

  // ==========================================
  // FIXTURE L: FreeText Annotation
  // ==========================================
  {
    const id = 'FIXTURE_L_FREETEXT';
    const canary = 'SECRET_CANARY_L_FREETEXT';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with FreeText Annotation', { x: 50, y: 780, size: 14, font });

    const freeTextDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      Rect: [100, 680, 400, 720],
      Contents: PDFString.of(canary),
      DA: PDFString.of('/Helv 12 Tf 0 0 0 rg'),
    });
    const freeTextRef = doc.context.register(freeTextDict);
    page.node.set(PDFName.of('Annots'), doc.context.obj([freeTextRef]));

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'FreeText Annotation',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 90, y: 842 - 730, width: 320, height: 50, originalText: canary },
      ],
      description: 'Native /FreeText annotation containing canary',
    });
  }

  // ==========================================
  // FIXTURE M: Form Field (AcroForm) Containing Secret
  // ==========================================
  {
    const id = 'FIXTURE_M_ACROFORM';
    const canary = 'SECRET_CANARY_M_ACROFORM_FIELD';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with AcroForm Interactive Field', { x: 50, y: 780, size: 14, font });

    const formField = doc.context.obj({
      FT: 'Tx',
      T: PDFString.of('SecretSSNField'),
      V: PDFString.of(canary),
      Rect: [50, 680, 250, 710],
      Subtype: 'Widget',
      Type: 'Annot',
    });
    const fieldRef = doc.context.register(formField);
    const formDict = doc.context.obj({
      Fields: [fieldRef],
      NeedAppearances: true,
    });
    const formRef = doc.context.register(formDict);
    doc.catalog.set(PDFName.of('AcroForm'), formRef);
    page.node.set(PDFName.of('Annots'), doc.context.obj([fieldRef]));

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'AcroForm Field Secret',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 720, width: 220, height: 40, originalText: canary },
      ],
      description: 'AcroForm text field and widget annotation with secret value in /V',
    });
  }

  // ==========================================
  // FIXTURE N: Info Metadata Containing Secret
  // ==========================================
  {
    const id = 'FIXTURE_N_INFO_METADATA';
    const canaryAuthor = 'SECRET_CANARY_N_AUTHOR_9821';
    const canaryTitle = 'SECRET_CANARY_N_TITLE_4319';
    const canarySubject = 'SECRET_CANARY_N_SUBJECT_1102';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    doc.setAuthor(canaryAuthor);
    doc.setTitle(canaryTitle);
    doc.setSubject(canarySubject);
    doc.setCreator('SECRET_CANARY_N_CREATOR');
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Sensitive /Info Trailer Metadata', { x: 50, y: 750, size: 14, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Document /Info Metadata',
      filePath,
      canaries: [canaryAuthor, canaryTitle, canarySubject],
      redactionBoxes: [
        { pageNumber: 1, x: 50, y: 50, width: 100, height: 50 },
      ],
      description: 'Trailer /Info dictionary entries (Author, Title, Subject)',
    });
  }

  // ==========================================
  // FIXTURE O: XMP Metadata Stream Containing Secret
  // ==========================================
  {
    const id = 'FIXTURE_O_XMP_METADATA';
    const canary = 'SECRET_CANARY_O_XMP_STREAM_7741';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Explicit XMP Metadata Stream', { x: 50, y: 750, size: 14, font });

    const xmpContent = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description><dc:description>${canary}</dc:description></rdf:Description></rdf:RDF></x:xmpmeta>`;
    const metaStream = doc.context.stream(xmpContent, {
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML'),
    });
    const metaRef = doc.context.register(metaStream);
    doc.catalog.set(PDFName.of('Metadata'), metaRef);

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'XMP Metadata Stream',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 50, y: 50, width: 100, height: 50 },
      ],
      description: 'Root catalog /Metadata XMP stream containing canary in XML packet',
    });
  }

  // ==========================================
  // FIXTURE P: JavaScript / Action Containing Secret
  // ==========================================
  {
    const id = 'FIXTURE_P_JAVASCRIPT';
    const canary = 'SECRET_CANARY_P_JAVASCRIPT_5502';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Embedded JavaScript Payload', { x: 50, y: 750, size: 14, font });

    const jsDict = doc.context.obj({
      S: 'JavaScript',
      JS: PDFString.of(`console.log("${canary}");`),
    });
    const jsRef = doc.context.register(jsDict);
    const namesDict = doc.context.obj({
      JavaScript: doc.context.obj({
        Names: [PDFString.of('AuditScript'), jsRef],
      }),
    });
    const namesRef = doc.context.register(namesDict);
    doc.catalog.set(PDFName.of('Names'), namesRef);

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Embedded JavaScript / Action',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 50, y: 50, width: 100, height: 50 },
      ],
      description: 'Names / JavaScript dictionary containing script with canary',
    });
  }

  // ==========================================
  // FIXTURE Q: Attachment Containing Secret
  // ==========================================
  {
    const id = 'FIXTURE_Q_ATTACHMENT';
    const canary = 'SECRET_CANARY_Q_EMBEDDED_FILE_8832';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Embedded File Attachment', { x: 50, y: 750, size: 14, font });

    const fileStream = doc.context.flateStream(`Attachment Content: ${canary}`, {
      Type: PDFName.of('EmbeddedFile'),
    });
    const fileRef = doc.context.register(fileStream);
    const fileSpec = doc.context.obj({
      Type: 'Filespec',
      F: PDFString.of('secret_attachment.txt'),
      EF: doc.context.obj({ F: fileRef }),
    });
    const fileSpecRef = doc.context.register(fileSpec);
    const namesDict = doc.context.obj({
      EmbeddedFiles: doc.context.obj({
        Names: [PDFString.of('secret_attachment.txt'), fileSpecRef],
      }),
    });
    const namesRef = doc.context.register(namesDict);
    doc.catalog.set(PDFName.of('Names'), namesRef);

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Embedded File Attachment',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 50, y: 50, width: 100, height: 50 },
      ],
      description: 'Catalog /Names /EmbeddedFiles dictionary with file attachment',
    });
  }

  // ==========================================
  // FIXTURE R: Optional Content / Layer Containing Secret
  // ==========================================
  {
    const id = 'FIXTURE_R_OCG_LAYER';
    const canary = 'SECRET_CANARY_R_OCG_LAYER_3190';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Document with Optional Content Group', { x: 50, y: 780, size: 14, font });

    // Optional content stream
    const contentStream = doc.context.flateStream(
      `/OC /Layer1 BDC BT /F1 12 Tf 50 720 Td (${canary}) Tj ET EMC`,
      {}
    );
    const streamRef = doc.context.register(contentStream);
    (page.node.get(PDFName.of('Contents')) ).push(streamRef);

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Optional Content Group (Layer)',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 735, width: 350, height: 30, originalText: canary },
      ],
      description: 'Text enclosed within an Optional Content Group (OCG / Layer)',
    });
  }

  // ==========================================
  // FIXTURE S: Multiple Redactions on One Page
  // ==========================================
  {
    const id = 'FIXTURE_S_MULTI_REDACT';
    const canaries = [];
    const redactionBoxes = [];
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);
    page.drawText('Page with 20 Discrete Secret Fields', { x: 50, y: 800, size: 14, font });

    for (let i = 1; i <= 20; i++) {
      const c = `SECRET_CANARY_S_${i < 10 ? '0' : ''}${i}_TOKEN`;
      canaries.push(c);
      const yPos = 760 - (i * 32);
      page.drawText(`Field ${i}: ${c}`, { x: 50, y: yPos, size: 10, font });
      redactionBoxes.push({
        pageNumber: 1,
        x: 45,
        y: 842 - yPos - 12,
        width: 320,
        height: 20,
        originalText: c,
      });
    }

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Multiple Redactions (20 Targets)',
      filePath,
      canaries,
      redactionBoxes,
      description: 'Single page with 20 distinct redaction zones',
    });
  }

  // ==========================================
  // FIXTURE T: Spanning Text + Image + Vector
  // ==========================================
  {
    const id = 'FIXTURE_T_SPANNING';
    const txtCanary = 'SECRET_CANARY_T_TEXT_991';
    const vecCanary = 'SECRET_CANARY_T_VEC_992';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([595, 842]);

    page.drawText(txtCanary, { x: 100, y: 650, size: 12, font });
    page.drawRectangle({
      x: 90,
      y: 600,
      width: 200,
      height: 90,
      borderColor: rgb(0.9, 0.2, 0.2),
      borderWidth: 2,
    });
    const imgBytes = Buffer.from(TINY_PNG_BASE64, 'base64');
    const img = await doc.embedPng(imgBytes);
    page.drawImage(img, { x: 150, y: 610, width: 80, height: 40 });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Spanning Text + Vector + Image',
      filePath,
      canaries: [txtCanary, vecCanary],
      redactionBoxes: [
        { pageNumber: 1, x: 80, y: 842 - 700, width: 230, height: 120, originalText: txtCanary },
      ],
      description: 'Single large redaction covering text, vector border, and embedded image',
    });
  }

  // ==========================================
  // FIXTURE U: Rotated Pages (90, 180, 270)
  // ==========================================
  {
    const id = 'FIXTURE_U_ROTATED_PAGES';
    const c90 = 'SECRET_CANARY_U_ROT90_PAGE1';
    const c180 = 'SECRET_CANARY_U_ROT180_PAGE2';
    const c270 = 'SECRET_CANARY_U_ROT270_PAGE3';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');

    // Page 1: 90 deg rotation
    const p1 = doc.addPage([595, 842]);
    p1.setRotation(degrees(90));
    p1.drawText(c90, { x: 100, y: 500, size: 14, font });

    // Page 2: 180 deg rotation
    const p2 = doc.addPage([595, 842]);
    p2.setRotation(degrees(180));
    p2.drawText(c180, { x: 100, y: 500, size: 14, font });

    // Page 3: 270 deg rotation
    const p3 = doc.addPage([595, 842]);
    p3.setRotation(degrees(270));
    p3.drawText(c270, { x: 100, y: 500, size: 14, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Rotated Pages (90, 180, 270)',
      filePath,
      canaries: [c90, c180, c270],
      redactionBoxes: [
        { pageNumber: 1, x: 90, y: 842 - 520, width: 350, height: 40, originalText: c90 },
        { pageNumber: 2, x: 90, y: 842 - 520, width: 350, height: 40, originalText: c180 },
        { pageNumber: 3, x: 90, y: 842 - 520, width: 350, height: 40, originalText: c270 },
      ],
      description: 'Document with pages rotated by 90, 180, and 270 degrees',
    });
  }

  // ==========================================
  // FIXTURE V: CropBox != MediaBox
  // ==========================================
  {
    const id = 'FIXTURE_V_CROPBOX_MEDIABOX';
    const canary = 'SECRET_CANARY_V_CROPBOX_OFFSET_719';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const page = doc.addPage([612, 792]);
    // Set non-zero origin CropBox: [50, 50, 550, 750]
    page.node.set(PDFName.of('CropBox'), doc.context.obj([50, 50, 550, 750]));
    page.drawText(canary, { x: 100, y: 650, size: 14, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'CropBox != MediaBox Offset',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 90, y: 792 - 670, width: 350, height: 40, originalText: canary },
      ],
      description: 'Page with MediaBox [0,0,612,792] and offset CropBox [50,50,550,750]',
    });
  }

  // ==========================================
  // FIXTURE W: Unusual Dimensions
  // ==========================================
  {
    const id = 'FIXTURE_W_UNUSUAL_DIMS';
    const canary = 'SECRET_CANARY_W_UNUSUAL_DIM_1200x300';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    // Wide banner page
    const page = doc.addPage([1200, 300]);
    page.drawText(`Banner Secret: ${canary}`, { x: 50, y: 150, size: 16, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Unusual Page Dimensions (1200x300 Banner)',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 300 - 170, width: 500, height: 40, originalText: canary },
      ],
      description: 'Extreme aspect ratio landscape banner page',
    });
  }

  // ==========================================
  // FIXTURE X: Page Management Sequence
  // ==========================================
  {
    const id = 'FIXTURE_X_PAGE_MGMT';
    const canary = 'SECRET_CANARY_X_PAGEMGMT_REORDER';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const p1 = doc.addPage([595, 842]);
    p1.drawText('Original Page 1 - Public', { x: 50, y: 750, size: 14, font });
    const p2 = doc.addPage([595, 842]);
    p2.drawText(`Original Page 2 - ${canary}`, { x: 50, y: 750, size: 14, font });
    const p3 = doc.addPage([595, 842]);
    p3.drawText('Original Page 3 - Public', { x: 50, y: 750, size: 14, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Page Management Interaction',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 2, x: 45, y: 842 - 770, width: 400, height: 40, originalText: canary },
      ],
      description: 'Page reorder, duplication, and redaction binding verification',
    });
  }

  // ==========================================
  // FIXTURE Y: Multiple Redactions Across Multiple Pages
  // ==========================================
  {
    const id = 'FIXTURE_Y_MULTI_PAGE_MULTI_REDACT';
    const c1 = 'SECRET_CANARY_Y_PAGE1_SSN';
    const c2 = 'SECRET_CANARY_Y_PAGE2_BANK';
    const c4 = 'SECRET_CANARY_Y_PAGE4_PASS';
    const unredactedToken = 'PUBLIC_PRESERVED_VECTOR_TEXT_PAGE3';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica-Bold');
    const fontNorm = await doc.embedFont('Helvetica');

    // Page 1 (Redacted)
    const p1 = doc.addPage([595, 842]);
    p1.drawText(c1, { x: 50, y: 720, size: 14, font });

    // Page 2 (Redacted)
    const p2 = doc.addPage([595, 842]);
    p2.drawText(c2, { x: 50, y: 720, size: 14, font });

    // Page 3 (UNREDACTED - Must preserve vector!)
    const p3 = doc.addPage([595, 842]);
    p3.drawText(unredactedToken, { x: 50, y: 720, size: 14, font: fontNorm });

    // Page 4 (Redacted)
    const p4 = doc.addPage([595, 842]);
    p4.drawText(c4, { x: 50, y: 720, size: 14, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Multi-Page Redactions with Vector Page Isolation',
      filePath,
      canaries: [c1, c2, c4],
      redactionBoxes: [
        { pageNumber: 1, x: 45, y: 842 - 740, width: 350, height: 35, originalText: c1 },
        { pageNumber: 2, x: 45, y: 842 - 740, width: 350, height: 35, originalText: c2 },
        { pageNumber: 4, x: 45, y: 842 - 740, width: 350, height: 35, originalText: c4 },
      ],
      description: 'Pages 1, 2, 4 redacted; Page 3 unredacted vector preservation',
    });
  }

  // ==========================================
  // FIXTURE Z: Large Page / Memory Stress (16 MP clamp)
  // ==========================================
  {
    const id = 'FIXTURE_Z_MEMORY_STRESS';
    const canary = 'SECRET_CANARY_Z_LARGE_PAGE_ARCH';
    const filePath = path.join(FIXTURES_DIR, `${id}.pdf`);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica-Bold');
    // 36" x 48" = 2592 x 3456 points
    const page = doc.addPage([2592, 3456]);
    page.drawText('Architectural Blueprint - Sensitive Revision', { x: 100, y: 3300, size: 36, font });
    page.drawText(canary, { x: 100, y: 3100, size: 32, font });

    const bytes = await doc.save();
    fs.writeFileSync(filePath, bytes);
    fixtures.push({
      id,
      name: 'Large Architectural Page (16 MP Safety Clamp)',
      filePath,
      canaries: [canary],
      redactionBoxes: [
        { pageNumber: 1, x: 90, y: 3456 - 3150, width: 800, height: 80, originalText: canary },
      ],
      description: '36x48 inch page (2592x3456 pt) triggering the 16 MP canvas ceiling clamp',
    });
  }

  return fixtures;
}

if (process.argv[1].endsWith('phase5b-generate-fixtures.js')) {
  generateAllFixtures().then((res) => {
    console.log(`Generated ${res.length} adversarial fixtures in ${FIXTURES_DIR}`);
  });
}
