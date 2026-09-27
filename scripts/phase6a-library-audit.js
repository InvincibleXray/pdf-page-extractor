/**
 * Phase 6A — Empirical Library Capability & Edge-Case Audit
 * 
 * Deeply tests pdf-lib (1.17.1) and pdfjs-dist (4.10.38) across:
 * - Field enumeration and type discrimination
 * - Reading and writing field values
 * - Appearance stream generation (/AP) vs NeedAppearances
 * - Form flattening behavior (text, checkbox, radio, dropdown)
 * - CopyPages vs in-place mutation
 * - Widget annotation geometry and metadata in PDF.js
 * - Signature, XFA, and Malformed PDF behavior
 */
import fs from 'fs';
import path from 'path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  PDFBool,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

const fixturesDir = path.resolve('test-fixtures/phase6a');

async function auditLibraryCapabilities() {
  console.log('================================================================');
  console.log('PHASE 6A: EMPIRICAL LIBRARY AUDIT (pdf-lib & pdfjs-dist)');
  console.log('================================================================\n');

  const results = {
    pdfLib: {},
    pdfJs: {},
    exportAndFlattening: {},
    copyPagesVsInPlace: {},
    edgeCases: {},
  };

  // -------------------------------------------------------------------------
  // 1. pdf-lib Capability Audit across Fixtures A through F
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: pdf-lib Field Discrimination & Mutation ---');
  const fieldTypeTests = [
    { id: 'FIXTURE_A', file: 'FIXTURE_A_SINGLE_TEXT.pdf', expectedType: 'PDFTextField' },
    { id: 'FIXTURE_B', file: 'FIXTURE_B_MULTILINE_TEXT.pdf', expectedType: 'PDFTextField' },
    { id: 'FIXTURE_C', file: 'FIXTURE_C_CHECKBOX.pdf', expectedType: 'PDFCheckBox' },
    { id: 'FIXTURE_D', file: 'FIXTURE_D_RADIO_GROUP.pdf', expectedType: 'PDFRadioGroup' },
    { id: 'FIXTURE_E', file: 'FIXTURE_E_DROPDOWN.pdf', expectedType: 'PDFDropdown' },
    { id: 'FIXTURE_F', file: 'FIXTURE_F_LISTBOX.pdf', expectedType: 'PDFOptionList' },
  ];

  for (const test of fieldTypeTests) {
    const bytes = fs.readFileSync(path.join(fixturesDir, test.file));
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const fields = form.getFields();

    const fieldReports = fields.map(f => {
      let typeName = 'Unknown';
      if (f instanceof PDFTextField) typeName = 'PDFTextField';
      else if (f instanceof PDFCheckBox) typeName = 'PDFCheckBox';
      else if (f instanceof PDFRadioGroup) typeName = 'PDFRadioGroup';
      else if (f instanceof PDFDropdown) typeName = 'PDFDropdown';
      else if (f instanceof PDFOptionList) typeName = 'PDFOptionList';
      else if (f instanceof PDFButton) typeName = 'PDFButton';
      else if (f instanceof PDFSignature) typeName = 'PDFSignature';

      let val = null;
      try {
        if (f instanceof PDFTextField) val = f.getText();
        else if (f instanceof PDFCheckBox) val = f.isChecked();
        else if (f instanceof PDFRadioGroup) val = f.getSelected();
        else if (f instanceof PDFDropdown) val = f.getSelected();
        else if (f instanceof PDFOptionList) val = f.getSelected();
      } catch (e) {
        val = `Error: ${e.message}`;
      }

      return {
        name: f.getName(),
        typeName,
        value: val,
        readOnly: f.isReadOnly(),
        required: f.isRequired(),
      };
    });

    results.pdfLib[test.id] = {
      file: test.file,
      totalFields: fields.length,
      fieldReports,
    };
    console.log(`  ${test.file}: ${fields.length} field(s) found. Types: ${fieldReports.map(r => r.typeName).join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // 2. Field Value Mutation & Serialization Round-Trip
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Field Value Mutation & Serialization ---');
  {
    const bytesA = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_A_SINGLE_TEXT.pdf'));
    const docA = await PDFDocument.load(bytesA);
    const formA = docA.getForm();
    const tf = formA.getTextField('applicant.firstName');
    const oldVal = tf.getText();
    tf.setText('EMPIRICAL_MUTATED_VALUE');
    const savedBytes = await docA.save();

    // Reload and verify
    const reloaded = await PDFDocument.load(savedBytes);
    const reloadedVal = reloaded.getForm().getTextField('applicant.firstName').getText();
    const mutationPass = reloadedVal === 'EMPIRICAL_MUTATED_VALUE';
    results.pdfLib['mutationRoundTrip'] = {
      oldVal,
      newVal: 'EMPIRICAL_MUTATED_VALUE',
      reloadedVal,
      mutationPass,
    };
    console.log(`  Single-text mutation: "${oldVal}" -> "${reloadedVal}" (Match: ${mutationPass})`);

    // Test Checkbox toggle
    const bytesC = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_C_CHECKBOX.pdf'));
    const docC = await PDFDocument.load(bytesC);
    const formC = docC.getForm();
    const cb = formC.getCheckBox('terms.agree');
    const initialCheck = cb.isChecked();
    cb.uncheck();
    const reloadedC = await PDFDocument.load(await docC.save());
    const finalCheck = reloadedC.getForm().getCheckBox('terms.agree').isChecked();
    console.log(`  Checkbox toggle: ${initialCheck} -> ${finalCheck} (Toggled: ${initialCheck !== finalCheck})`);

    // Test Radio Group select
    const bytesD = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_D_RADIO_GROUP.pdf'));
    const docD = await PDFDocument.load(bytesD);
    const formD = docD.getForm();
    const rg = formD.getRadioGroup('payment.method');
    const initialRadio = rg.getSelected();
    rg.select('BankWire');
    const reloadedD = await PDFDocument.load(await docD.save());
    const finalRadio = reloadedD.getForm().getRadioGroup('payment.method').getSelected();
    console.log(`  Radio selection: "${initialRadio}" -> "${finalRadio}" (Selected: ${finalRadio === 'BankWire'})`);

    // Test Dropdown select
    const bytesE = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_E_DROPDOWN.pdf'));
    const docE = await PDFDocument.load(bytesE);
    const formE = docE.getForm();
    const dd = formE.getDropdown('shipping.country');
    const initialDd = dd.getSelected();
    dd.select('Japan');
    const reloadedE = await PDFDocument.load(await docE.save());
    const finalDd = reloadedE.getForm().getDropdown('shipping.country').getSelected();
    console.log(`  Dropdown selection: ${JSON.stringify(initialDd)} -> ${JSON.stringify(finalDd)} (Selected: ${finalDd[0] === 'Japan'})`);
  }

  // -------------------------------------------------------------------------
  // 3. Form Flattening Behavior (form.flatten())
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Form Flattening Behavior ---');
  {
    const bytesA = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_A_SINGLE_TEXT.pdf'));
    const docFlatten = await PDFDocument.load(bytesA);
    const form = docFlatten.getForm();
    form.getTextField('applicant.firstName').setText('FLATTENED_NAME');
    form.flatten();
    const flattenedBytes = await docFlatten.save();

    // Verify reloaded flattened document
    const reloadedFlat = await PDFDocument.load(flattenedBytes);
    const reloadedForm = reloadedFlat.getForm();
    const flatFields = reloadedForm.getFields();
    console.log(`  After form.flatten(): total interactive fields remaining = ${flatFields.length}`);
    
    // Check if PDF.js still sees text in text content or annotations
    const jsDoc = await pdfjsLib.getDocument({ data: flattenedBytes }).promise;
    const jsPage = await jsDoc.getPage(1);
    const annots = await jsPage.getAnnotations();
    const textContent = await jsPage.getTextContent();
    const textItems = textContent.items.map(i => i.str).join(' ');
    console.log(`  PDF.js annotations on flattened page: ${annots.length}`);
    console.log(`  PDF.js extracted text contains "FLATTENED_NAME"? ${textItems.includes('FLATTENED_NAME')}`);

    results.exportAndFlattening['flattening'] = {
      interactiveFieldsRemaining: flatFields.length,
      annotationsRemaining: annots.length,
      textBakedIntoStream: textItems.includes('FLATTENED_NAME'),
    };
  }

  // -------------------------------------------------------------------------
  // 4. copyPages() vs In-Place Mutation Gap
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: copyPages() vs In-Place Document Mutation ---');
  {
    const bytesA = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_A_SINGLE_TEXT.pdf'));
    
    // Approach 1: copyPages to brand-new PDFDocument.create()
    const srcDoc1 = await PDFDocument.load(bytesA);
    const outDoc1 = await PDFDocument.create();
    const [copiedPage] = await outDoc1.copyPages(srcDoc1, [0]);
    outDoc1.addPage(copiedPage);
    const copyForm = outDoc1.getForm();
    const copyFields = copyForm.getFields();
    const copyHasAcroForm = outDoc1.catalog.has(PDFName.of('AcroForm'));

    // Approach 2: in-place modification of srcDoc
    const srcDoc2 = await PDFDocument.load(bytesA);
    const inPlaceForm = srcDoc2.getForm();
    const inPlaceFields = inPlaceForm.getFields();
    const inPlaceHasAcroForm = srcDoc2.catalog.has(PDFName.of('AcroForm'));

    console.log(`  Approach 1 (copyPages to new doc): AcroForm in Catalog: ${copyHasAcroForm}, Fields count: ${copyFields.length}`);
    console.log(`  Approach 2 (in-place modification): AcroForm in Catalog: ${inPlaceHasAcroForm}, Fields count: ${inPlaceFields.length}`);

    results.copyPagesVsInPlace = {
      copyPages: { hasAcroForm: copyHasAcroForm, fieldCount: copyFields.length },
      inPlace: { hasAcroForm: inPlaceHasAcroForm, fieldCount: inPlaceFields.length },
      architecturalImpact: copyFields.length === 0
        ? 'CRITICAL: copyPages() silently strips AcroForm catalog. Form export MUST use in-place mutation or catalog transfer.'
        : 'copyPages() preserves form fields.',
    };
  }

  // -------------------------------------------------------------------------
  // 5. PDF.js Widget Annotation Inspection across Fixtures
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 5: PDF.js Widget Annotation Inspection ---');
  const jsFixtures = [
    'FIXTURE_A_SINGLE_TEXT.pdf',
    'FIXTURE_B_MULTILINE_TEXT.pdf',
    'FIXTURE_C_CHECKBOX.pdf',
    'FIXTURE_D_RADIO_GROUP.pdf',
    'FIXTURE_E_DROPDOWN.pdf',
    'FIXTURE_F_LISTBOX.pdf',
    'FIXTURE_G_REQUIRED.pdf',
    'FIXTURE_H_READONLY.pdf',
    'FIXTURE_I_HIDDEN.pdf',
    'FIXTURE_J_MULTI_WIDGET_FIELD.pdf',
    'FIXTURE_L_ROTATED_PAGE.pdf',
    'FIXTURE_R_SIGNATURE.pdf',
    'FIXTURE_S_XFA.pdf',
    'FIXTURE_T_FLATTENED_STATIC.pdf',
  ];

  for (const file of jsFixtures) {
    const bytes = fs.readFileSync(path.join(fixturesDir, file));
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    const jsDoc = await loadingTask.promise;
    
    let totalWidgets = 0;
    const pageReports = [];

    for (let p = 1; p <= jsDoc.numPages; p++) {
      const page = await jsDoc.getPage(p);
      const annots = await page.getAnnotations({ intent: 'display' });
      const widgets = annots.filter(a => a.subtype === 'Widget');
      totalWidgets += widgets.length;

      const widgetDetails = widgets.map(w => ({
        id: w.id,
        fieldName: w.fieldName,
        fieldType: w.fieldType,
        fieldValue: w.fieldValue,
        rect: w.rect,
        readOnly: w.readOnly,
        required: w.required,
        hidden: w.hidden,
        multiLine: w.multiLine,
        maxLen: w.maxLen,
        comb: w.comb,
        options: w.options ? w.options.map(o => o.displayValue || o.exportValue) : undefined,
      }));

      pageReports.push({ pageNumber: p, widgetCount: widgets.length, widgetDetails });
    }

    const fieldObjs = await jsDoc.getFieldObjects();
    const hasFieldObjects = fieldObjs !== null && Object.keys(fieldObjs).length > 0;

    results.pdfJs[file] = {
      pages: jsDoc.numPages,
      totalWidgets,
      hasFieldObjects,
      fieldObjectKeys: hasFieldObjects ? Object.keys(fieldObjs) : [],
      pageReports,
    };

    console.log(`  ${file}: ${totalWidgets} widget(s) across ${jsDoc.numPages} page(s). hasFieldObjects: ${hasFieldObjects}`);
  }

  // -------------------------------------------------------------------------
  // 6. Signature Field Analysis
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Signature Field Behavior (Fixture R) ---');
  {
    const bytes = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_R_SIGNATURE.pdf'));
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const fields = form.getFields();
    console.log(`  pdf-lib total fields in Fixture R: ${fields.length}`);
    if (fields.length > 0) {
      console.log(`  Field name: ${fields[0].getName()}, constructor: ${fields[0].constructor.name}`);
      console.log(`  Is PDFSignature instance? ${fields[0] instanceof PDFSignature}`);
    }

    const jsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
    const page = await jsDoc.getPage(1);
    const annots = await page.getAnnotations();
    const sigAnnot = annots.find(a => a.fieldType === 'Sig');
    console.log(`  PDF.js Sig annotation found? ${!!sigAnnot}, fieldName: ${sigAnnot?.fieldName}`);

    results.edgeCases['signature'] = {
      pdfLibDetected: fields.length > 0,
      pdfLibFieldType: fields[0]?.constructor?.name,
      pdfJsDetected: !!sigAnnot,
      sigAnnotName: sigAnnot?.fieldName,
      signingCapability: 'NOT SUPPORTED: pdf-lib cannot generate PKCS#7 cryptographic digital signatures without external crypto provider.',
    };
  }

  // -------------------------------------------------------------------------
  // 7. XFA Form Analysis (Fixture S)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 7: XFA Form Behavior (Fixture S) ---');
  {
    const bytes = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_S_XFA.pdf'));
    const doc = await PDFDocument.load(bytes);
    const acroRef = doc.catalog.get(PDFName.of('AcroForm'));
    const acroDict = doc.context.lookup(acroRef);
    const hasXfaInCatalog = acroDict instanceof PDFDict && acroDict.has(PDFName.of('XFA'));
    console.log(`  Has /XFA dictionary in catalog: ${hasXfaInCatalog}`);

    // Test what happens when getForm() is called on XFA
    const form = doc.getForm();
    const fieldsBeforeSave = form.getFields().length;
    const savedBytes = await doc.save();
    const reloaded = await PDFDocument.load(savedBytes);
    const reloadedAcro = reloaded.catalog.get(PDFName.of('AcroForm'));
    const reloadedAcroDict = reloaded.context.lookup(reloadedAcro);
    const hasXfaAfterSave = reloadedAcroDict instanceof PDFDict && reloadedAcroDict.has(PDFName.of('XFA'));

    console.log(`  XFA preserved after doc.save()? ${hasXfaAfterSave}`);

    results.edgeCases['xfa'] = {
      detectedInCatalog: hasXfaInCatalog,
      preservedAfterSave: hasXfaAfterSave,
      riskAssessment: 'CRITICAL: pdf-lib removes /XFA data upon saving if getForm() is invoked. Dynamic XFA editing is NOT feasible with pdf-lib.',
    };
  }

  // -------------------------------------------------------------------------
  // 8. Missing Appearance Streams (/AP) & NeedAppearances (Fixtures O & P)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Appearance Streams & NeedAppearances (Fixtures O & P) ---');
  {
    // Fixture O: Missing /AP
    const bytesO = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_O_MISSING_AP.pdf'));
    const jsDocO = await pdfjsLib.getDocument({ data: new Uint8Array(bytesO) }).promise;
    const pageO = await jsDocO.getPage(1);
    const annotsO = await pageO.getAnnotations();
    const annotO = annotsO.find(a => a.fieldName === 'unrendered.value');
    console.log(`  Fixture O (Missing /AP): PDF.js hasAppearance = ${annotO?.hasAppearance}, fieldValue = "${annotO?.fieldValue}"`);

    // Fixture P: NeedAppearances = true
    const bytesP = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_P_NEED_APPEARANCES.pdf'));
    const docP = await PDFDocument.load(bytesP);
    const formP = docP.getForm();
    const needFlag = formP.acroForm.dict.has(PDFName.of('NeedAppearances'))
      ? formP.acroForm.dict.get(PDFName.of('NeedAppearances')).value
      : false;
    console.log(`  Fixture P (NeedAppearances flag): ${needFlag}`);

    results.edgeCases['appearanceStreams'] = {
      missingApPdfJsReadable: annotO?.fieldValue === 'Rendered Only If Viewer Generates Appearance',
      missingApHasAppearance: annotO?.hasAppearance,
      needAppearancesFlag: needFlag,
    };
  }

  // -------------------------------------------------------------------------
  // 9. Malformed / Orphaned Widget (Fixture Q)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 9: Malformed AcroForm (Fixture Q) ---');
  {
    const bytesQ = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_Q_MALFORMED.pdf'));
    const docQ = await PDFDocument.load(bytesQ);
    const formQ = docQ.getForm();
    const fieldsQ = formQ.getFields().map(f => f.getName());
    console.log(`  pdf-lib getFields in Fixture Q: [${fieldsQ.join(', ')}]`);

    const jsDocQ = await pdfjsLib.getDocument({ data: new Uint8Array(bytesQ) }).promise;
    const pageQ = await jsDocQ.getPage(1);
    const annotsQ = await pageQ.getAnnotations();
    const widgetNames = annotsQ.filter(a => a.subtype === 'Widget').map(a => a.fieldName);
    console.log(`  PDF.js widget annotations in Fixture Q: [${widgetNames.join(', ')}]`);

    results.edgeCases['malformed'] = {
      pdfLibFields: fieldsQ,
      pdfJsWidgets: widgetNames,
      discrepancy: 'PDF.js discovers orphaned widget directly from page /Annots, while pdf-lib ignores it because it is not in /AcroForm /Fields tree.',
    };
  }

  // -------------------------------------------------------------------------
  // Write Out Full Empirical Audit JSON
  // -------------------------------------------------------------------------
  const reportPath = path.resolve('test-fixtures/phase6a/library-audit-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Empirical library audit complete. Full results written to ${reportPath}\n`);

  return results;
}

auditLibraryCapabilities().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
