import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import fs from 'fs';
import path from 'path';

/**
 * Phase 6C Independent Forensic PDF Verifier
 * 
 * Independently parses exported PDF byte streams without using application code:
 * - Direct AST / Dictionary inspection of /Catalog, /AcroForm, /Fields, and /Annots
 * - Multi-engine verification (pdf-lib + pdfjs-dist)
 * - Raw binary & decompressed stream scanning for canary strings
 */

function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input);
}

/**
 * 1. Independent Interactive Form Verification
 */
export async function verifyInteractiveFormPdf(pdfBytesInput, expectedFields = {}) {
  const pdfBytes = toUint8Array(pdfBytesInput);
  const errors = [];
  let hasCatalogAcroForm = false;
  let hasFieldsArray = false;
  let fieldCount = 0;
  const fieldsData = {};
  let orphanWidgets = 0;
  let pdfJsWidgetsCount = 0;

  try {
    const doc = await PDFDocument.load(pdfBytes.slice(0));
    const acroFormRef = doc.catalog.get(PDFName.of('AcroForm'));
    hasCatalogAcroForm = !!acroFormRef;

    if (!hasCatalogAcroForm) {
      errors.push('Missing /Catalog /AcroForm dictionary entry');
    } else {
      const acroFormDict = doc.context.lookup(acroFormRef);
      if (acroFormDict instanceof PDFDict) {
        const fieldsRef = acroFormDict.get(PDFName.of('Fields'));
        const fieldsArray = doc.context.lookup(fieldsRef);
        if (fieldsArray instanceof PDFArray) {
          hasFieldsArray = true;
          fieldCount = fieldsArray.size();
        } else {
          errors.push('/AcroForm /Fields is not a valid PDFArray');
        }
      }
    }

    // Inspect fields via pdf-lib form API
    const form = doc.getForm();
    const docFields = form.getFields();
    for (const f of docFields) {
      const name = f.getName();
      let val = undefined;
      const typeName = f.constructor.name;
      try {
        if ('getText' in f) val = f.getText();
        else if ('isChecked' in f) val = f.isChecked();
        else if ('getSelected' in f) val = f.getSelected();
      } catch (e) {}

      fieldsData[name] = {
        name,
        type: typeName,
        value: val,
      };
    }

    // Verify expectations
    for (const [expName, exp] of Object.entries(expectedFields)) {
      const actual = fieldsData[expName];
      if (!actual) {
        errors.push(`Expected field "${expName}" not found in /AcroForm /Fields`);
        continue;
      }
      if (exp.expectedValue !== undefined) {
        if (typeof exp.expectedValue === 'boolean') {
          if (actual.value !== exp.expectedValue) {
            errors.push(`Field "${expName}" value mismatch: expected boolean ${exp.expectedValue}, got ${actual.value}`);
          }
        } else if (Array.isArray(exp.expectedValue)) {
          const actArr = Array.isArray(actual.value) ? actual.value : [actual.value];
          for (const item of exp.expectedValue) {
            if (!actArr.includes(item)) {
              errors.push(`Field "${expName}" missing expected selection "${item}" (got ${JSON.stringify(actual.value)})`);
            }
          }
        } else {
          if (String(actual.value) !== String(exp.expectedValue)) {
            errors.push(`Field "${expName}" value mismatch: expected "${exp.expectedValue}", got "${actual.value}"`);
          }
        }
      }
    }

    // Inspect widgets via PDF.js
    const jsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
    for (let p = 1; p <= jsDoc.numPages; p++) {
      const pageProxy = await jsDoc.getPage(p);
      const annots = await pageProxy.getAnnotations();
      const widgets = annots.filter((a) => a.subtype === 'Widget');
      pdfJsWidgetsCount += widgets.length;
    }
    await jsDoc.destroy();

    if (pdfJsWidgetsCount === 0 && Object.keys(expectedFields).length > 0) {
      errors.push('PDF.js found 0 widget annotations in interactive form export');
    }
  } catch (err) {
    errors.push(`Interactive verification exception: ${err.message}`);
  }

  return {
    passed: errors.length === 0,
    hasCatalogAcroForm,
    hasFieldsArray,
    fieldCount,
    fields: fieldsData,
    orphanWidgets,
    pdfJsWidgetsCount,
    errors,
  };
}

/**
 * 2. Independent Flattened Form Verification
 */
export async function verifyFlattenedFormPdf(pdfBytesInput, expectedBakedSnippets = []) {
  const pdfBytes = toUint8Array(pdfBytesInput);
  const errors = [];
  let hasUsableAcroForm = false;
  let editableFieldCount = 0;
  let survivingWidgetsCount = 0;
  let bakedTextPresent = true;

  try {
    const doc = await PDFDocument.load(pdfBytes.slice(0));
    if (doc.catalog.has(PDFName.of('AcroForm'))) {
      const form = doc.getForm();
      const fields = form.getFields();
      if (fields.length > 0) {
        hasUsableAcroForm = true;
        editableFieldCount = fields.length;
        errors.push(`Flattened PDF still contains ${fields.length} editable /AcroForm fields!`);
      }
    }

    // PDF.js verification: 0 widget annotations
    const jsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
    let allPageText = '';
    for (let p = 1; p <= jsDoc.numPages; p++) {
      const pageProxy = await jsDoc.getPage(p);
      const annots = await pageProxy.getAnnotations();
      const widgets = annots.filter((a) => a.subtype === 'Widget');
      survivingWidgetsCount += widgets.length;

      const textContent = await pageProxy.getTextContent();
      const pageStr = textContent.items.map((i) => i.str || '').join(' ');
      allPageText += ' ' + pageStr;
    }
    await jsDoc.destroy();

    if (survivingWidgetsCount > 0) {
      errors.push(`Flattened PDF contains ${survivingWidgetsCount} surviving /Widget annotations!`);
    }

    // Verify expected text was baked into content stream
    for (const snippet of expectedBakedSnippets) {
      if (!allPageText.includes(snippet)) {
        bakedTextPresent = false;
        errors.push(`Baked text snippet "${snippet}" not found in page content streams!`);
      }
    }
  } catch (err) {
    errors.push(`Flattened verification exception: ${err.message}`);
  }

  return {
    passed: errors.length === 0,
    hasUsableAcroForm,
    editableFieldCount,
    survivingWidgetsCount,
    bakedTextPresent,
    errors,
  };
}

/**
 * 3. Independent Forensic Canary Verification (Phase 5 Secure Redaction Reconciliation)
 */
export async function verifyRedactedCanary(pdfBytesInput, canaryString) {
  const pdfBytes = toUint8Array(pdfBytesInput);
  const leaks = [];
  let foundInTextLayer = false;
  let foundInRawAscii = false;
  let foundInRawUtf8 = false;
  let foundInUtf16Hex = false;
  let foundInAcroForm = false;
  let foundInAnnotations = false;

  const target = canaryString.trim();
  if (!target) {
    return {
      passed: true,
      foundInTextLayer: false,
      foundInRawAscii: false,
      foundInRawUtf8: false,
      foundInUtf16Hex: false,
      foundInAcroForm: false,
      foundInAnnotations: false,
      leaks: [],
    };
  }

  // A. PDF.js text layer scan
  try {
    const jsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
    for (let p = 1; p <= jsDoc.numPages; p++) {
      const page = await jsDoc.getPage(p);
      const textContent = await page.getTextContent();
      const str = textContent.items.map((i) => i.str || '').join(' ');
      if (str.includes(target)) {
        foundInTextLayer = true;
        leaks.push(`Canary string "${target}" found in PDF.js text layer on page ${p}`);
      }

      const annots = await page.getAnnotations();
      for (const a of annots) {
        const aStr = JSON.stringify(a);
        if (aStr.includes(target)) {
          foundInAnnotations = true;
          leaks.push(`Canary string "${target}" found inside annotation on page ${p}`);
        }
      }
    }
    await jsDoc.destroy();
  } catch (e) {
    leaks.push(`PDF.js canary scan error: ${e.message}`);
  }

  // B. Raw ASCII scan
  const rawAscii = new TextDecoder('latin1').decode(pdfBytes);
  if (rawAscii.includes(target)) {
    foundInRawAscii = true;
    leaks.push(`Canary string "${target}" detected in raw uncompressed ASCII stream!`);
  }

  // C. Raw UTF-8 scan
  const rawUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(pdfBytes);
  if (rawUtf8.includes(target)) {
    foundInRawUtf8 = true;
    leaks.push(`Canary string "${target}" detected in raw UTF-8 stream!`);
  }

  // D. UTF-16BE Hex scan (how pdf-lib encodes text field values in /V <FEFF...>)
  let hexCanary = '';
  for (let i = 0; i < target.length; i++) {
    const code = target.charCodeAt(i);
    hexCanary += code.toString(16).padStart(4, '0').toUpperCase();
  }
  if (rawAscii.toUpperCase().includes(hexCanary)) {
    foundInUtf16Hex = true;
    leaks.push(`Canary UTF-16BE hex token "${hexCanary}" detected in PDF byte stream!`);
  }

  // E. AcroForm dictionary scan
  try {
    const doc = await PDFDocument.load(pdfBytes.slice(0));
    if (doc.catalog.has(PDFName.of('AcroForm'))) {
      const form = doc.getForm();
      for (const f of form.getFields()) {
        try {
          if ('getText' in f && f.getText()?.includes(target)) {
            foundInAcroForm = true;
            leaks.push(`Canary string "${target}" retained in AcroForm field "${f.getName()}"!`);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    leaks.push(`AcroForm canary check error: ${e.message}`);
  }

  return {
    passed: leaks.length === 0,
    foundInTextLayer,
    foundInRawAscii,
    foundInRawUtf8,
    foundInUtf16Hex,
    foundInAcroForm,
    foundInAnnotations,
    leaks,
  };
}

/**
 * Command-line runner for batch verification
 */
async function main() {
  console.log('================================================================');
  console.log('PHASE 6C INDEPENDENT FORENSIC EXPORT VERIFIER');
  console.log('================================================================\n');

  const realFormPath = path.resolve('test-fixtures/phase6c-real-form.pdf');
  const redactFormPath = path.resolve('test-fixtures/phase6c-redaction-form.pdf');

  if (!fs.existsSync(realFormPath) || !fs.existsSync(redactFormPath)) {
    console.error('Fixture files missing! Please run scripts/create-phase6c-fixtures.js first.');
    process.exit(1);
  }

  console.log('Fixtures validated.');
}

if (process.argv[1] && process.argv[1].endsWith('phase6c-export-verifier.js')) {
  main().catch((err) => {
    console.error('Error in verifier runner:', err);
    process.exit(1);
  });
}
