/**
 * Phase 6A — Form Test Fixture Generator (Fixtures A through T)
 * 
 * Generates 20 distinct, deterministic PDF form fixtures to empirically test
 * pdf-lib and pdfjs-dist capabilities, edge cases, and failure modes.
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
  PDFHexString,
  PDFBool,
  PDFNumber,
  PDFRef,
} from 'pdf-lib';

const fixturesDir = path.resolve('test-fixtures/phase6a');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

export async function generateAllFixtures() {
  console.log('Generating Phase 6A Form Fixtures A through T in', fixturesDir, '...\n');
  const summary = {};

  // =========================================================================
  // FIXTURE A: Single-Line Text Field
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture A: Single-Line Text Fields', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    
    // Standard text field
    page.drawText('First Name:', { x: 50, y: 730, size: 12, font });
    const tfFirst = form.createTextField('applicant.firstName');
    tfFirst.setText('Jane');
    tfFirst.setMaxLength(30);
    tfFirst.addToPage(page, { x: 150, y: 720, width: 200, height: 25 });

    // Text field with comb flag & char limit
    page.drawText('Social Security # (Comb 9):', { x: 50, y: 670, size: 12, font });
    const tfSsn = form.createTextField('applicant.ssn');
    tfSsn.setMaxLength(9);
    tfSsn.setText('123456789');
    tfSsn.addToPage(page, { x: 220, y: 660, width: 180, height: 25 });
    // Set comb flag (bit 25 = 1 << 24 = 16777216)
    const ssnWidget = tfSsn.acroField;
    const currentFf = ssnWidget.getFlags();
    ssnWidget.setFlags(currentFf | (1 << 24));

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_A_SINGLE_TEXT.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_A'] = { file: 'FIXTURE_A_SINGLE_TEXT.pdf', size: bytes.length, fields: 2 };
  }

  // =========================================================================
  // FIXTURE B: Multiline Text Field
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture B: Multiline Text Field', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    page.drawText('Executive Summary / Comments:', { x: 50, y: 730, size: 12, font });
    const tfMulti = form.createTextField('document.summary');
    tfMulti.enableMultiline();
    tfMulti.setText('Line 1: Project overview and preliminary goals.\nLine 2: Budget allocations and timeline projections.\nLine 3: Risk mitigation and sign-off criteria.');
    tfMulti.addToPage(page, { x: 50, y: 600, width: 495, height: 110 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_B_MULTILINE_TEXT.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_B'] = { file: 'FIXTURE_B_MULTILINE_TEXT.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE C: Checkbox
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture C: Checkboxes', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();

    const cb1 = form.createCheckBox('terms.agree');
    cb1.check();
    cb1.addToPage(page, { x: 50, y: 730, width: 18, height: 18 });
    page.drawText('I agree to the Terms of Service (Checked)', { x: 80, y: 733, size: 12, font });

    const cb2 = form.createCheckBox('newsletter.subscribe');
    cb2.uncheck();
    cb2.addToPage(page, { x: 50, y: 690, width: 18, height: 18 });
    page.drawText('Subscribe to weekly newsletter (Unchecked)', { x: 80, y: 693, size: 12, font });

    const cb3 = form.createCheckBox('shipping.express');
    cb3.check();
    cb3.addToPage(page, { x: 50, y: 650, width: 18, height: 18 });
    page.drawText('Expedited Courier Delivery (Checked)', { x: 80, y: 653, size: 12, font });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_C_CHECKBOX.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_C'] = { file: 'FIXTURE_C_CHECKBOX.pdf', size: bytes.length, fields: 3 };
  }

  // =========================================================================
  // FIXTURE D: Radio Group
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture D: Radio Button Group', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    page.drawText('Select Preferred Payment Method:', { x: 50, y: 740, size: 12, font });

    const rg = form.createRadioGroup('payment.method');
    rg.addOptionToPage('CreditCard', page, { x: 50, y: 700, width: 18, height: 18 });
    page.drawText('Credit Card', { x: 80, y: 703, size: 12, font });

    rg.addOptionToPage('PayPal', page, { x: 50, y: 660, width: 18, height: 18 });
    page.drawText('PayPal (Selected)', { x: 80, y: 663, size: 12, font });

    rg.addOptionToPage('BankWire', page, { x: 50, y: 620, width: 18, height: 18 });
    page.drawText('Bank Wire Transfer', { x: 80, y: 623, size: 12, font });

    rg.select('PayPal');

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_D_RADIO_GROUP.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_D'] = { file: 'FIXTURE_D_RADIO_GROUP.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE E: Dropdown / Combo Box
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture E: Dropdown Combo Box', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    page.drawText('Country of Origin:', { x: 50, y: 730, size: 12, font });

    const dd = form.createDropdown('shipping.country');
    dd.addOptions(['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia', 'Japan']);
    dd.select('United Kingdom');
    dd.addToPage(page, { x: 180, y: 720, width: 220, height: 25 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_E_DROPDOWN.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_E'] = { file: 'FIXTURE_E_DROPDOWN.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE F: List Box
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture F: List Box (Option List)', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    page.drawText('Primary Development Skills:', { x: 50, y: 730, size: 12, font });

    const optList = form.createOptionList('developer.skills');
    optList.addOptions(['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'C++', 'Java']);
    optList.select('TypeScript');
    optList.addToPage(page, { x: 50, y: 580, width: 240, height: 130 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_F_LISTBOX.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_F'] = { file: 'FIXTURE_F_LISTBOX.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE G: Required Fields
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture G: Required Fields (*)', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();

    page.drawText('* Email Address (Required):', { x: 50, y: 730, size: 12, font });
    const tfEmail = form.createTextField('contact.email');
    tfEmail.enableRequired();
    tfEmail.setText('user@example.com');
    tfEmail.addToPage(page, { x: 230, y: 720, width: 220, height: 25 });

    page.drawText('* Phone Number (Required):', { x: 50, y: 670, size: 12, font });
    const tfPhone = form.createTextField('contact.phone');
    tfPhone.enableRequired();
    tfPhone.setText('+1 (555) 019-2831');
    tfPhone.addToPage(page, { x: 230, y: 660, width: 220, height: 25 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_G_REQUIRED.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_G'] = { file: 'FIXTURE_G_REQUIRED.pdf', size: bytes.length, fields: 2 };
  }

  // =========================================================================
  // FIXTURE H: Read-Only Fields
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture H: Read-Only Fields', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();

    page.drawText('Generated System Audit ID (Read Only):', { x: 50, y: 730, size: 12, font });
    const tfAudit = form.createTextField('system.auditId');
    tfAudit.setText('AUD-2026-X892-F');
    tfAudit.enableReadOnly();
    tfAudit.addToPage(page, { x: 280, y: 720, width: 200, height: 25 });

    const cbVerified = form.createCheckBox('system.verified');
    cbVerified.check();
    cbVerified.enableReadOnly();
    cbVerified.addToPage(page, { x: 50, y: 670, width: 18, height: 18 });
    page.drawText('Security Compliance Verified (Read Only Checked)', { x: 80, y: 673, size: 12, font });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_H_READONLY.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_H'] = { file: 'FIXTURE_H_READONLY.pdf', size: bytes.length, fields: 2 };
  }

  // =========================================================================
  // FIXTURE I: Disabled / Hidden Field
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture I: Hidden Field (Annotation Flag F=2)', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    page.drawText('Visible Field:', { x: 50, y: 730, size: 12, font });
    const tfVisible = form.createTextField('visible.field');
    tfVisible.setText('I am visible');
    tfVisible.addToPage(page, { x: 150, y: 720, width: 200, height: 25 });

    // Hidden field: F flag = 2 (Hidden)
    const tfHidden = form.createTextField('hidden.trackingToken');
    tfHidden.setText('INTERNAL_SECRET_TOKEN_9981');
    tfHidden.addToPage(page, { x: 150, y: 660, width: 200, height: 25 });
    
    // Set widget annotation flag to 2 (Hidden)
    const widget = tfHidden.acroField.getWidgets()[0];
    widget.setFlags(2); // Hidden

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_I_HIDDEN.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_I'] = { file: 'FIXTURE_I_HIDDEN.pdf', size: bytes.length, fields: 2 };
  }

  // =========================================================================
  // FIXTURE J: Multiple Widgets Sharing One Field
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p1 = doc.addPage([595, 842]);
    const p2 = doc.addPage([595, 842]);

    p1.drawText('Fixture J: Multi-Widget Field (Page 1 of 2)', { x: 50, y: 790, size: 18, font });
    p1.drawText('Document Title Header Widget 1:', { x: 50, y: 730, size: 12, font });

    p2.drawText('Fixture J: Multi-Widget Field (Page 2 of 2)', { x: 50, y: 790, size: 18, font });
    p2.drawText('Document Title Header Widget 2 (Synchronized):', { x: 50, y: 730, size: 12, font });

    const form = doc.getForm();
    const tfShared = form.createTextField('document.headerTitle');
    tfShared.setText('Synchronized Header Value');
    // Add widget on Page 1
    tfShared.addToPage(p1, { x: 260, y: 720, width: 250, height: 25 });
    // Add second widget on Page 2 for the exact same field
    tfShared.addToPage(p2, { x: 320, y: 720, width: 220, height: 25 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_J_MULTI_WIDGET_FIELD.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_J'] = { file: 'FIXTURE_J_MULTI_WIDGET_FIELD.pdf', size: bytes.length, fields: 1, widgets: 2 };
  }

  // =========================================================================
  // FIXTURE K: Duplicate & Dot-Notation Hierarchical Names
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture K: Hierarchical & Dot-Notation Fields', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();

    page.drawText('Billing Street:', { x: 50, y: 730, size: 12, font });
    const bStreet = form.createTextField('billing.address.street');
    bStreet.setText('123 Market St');
    bStreet.addToPage(page, { x: 160, y: 720, width: 200, height: 25 });

    page.drawText('Billing City:', { x: 50, y: 680, size: 12, font });
    const bCity = form.createTextField('billing.address.city');
    bCity.setText('San Francisco');
    bCity.addToPage(page, { x: 160, y: 670, width: 200, height: 25 });

    page.drawText('Shipping Street:', { x: 50, y: 630, size: 12, font });
    const sStreet = form.createTextField('shipping.address.street');
    sStreet.setText('456 Mission Blvd');
    sStreet.addToPage(page, { x: 160, y: 620, width: 200, height: 25 });

    page.drawText('Shipping City:', { x: 50, y: 580, size: 12, font });
    const sCity = form.createTextField('shipping.address.city');
    sCity.setText('Oakland');
    sCity.addToPage(page, { x: 160, y: 570, width: 200, height: 25 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_K_DUPLICATE_NAMES.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_K'] = { file: 'FIXTURE_K_DUPLICATE_NAMES.pdf', size: bytes.length, fields: 4 };
  }

  // =========================================================================
  // FIXTURE L: Rotated Pages with Form Fields
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();

    const rotations = [0, 90, 180, 270];
    for (const rot of rotations) {
      const page = doc.addPage([595, 842]);
      page.setRotation(degrees(rot));
      page.drawText(`Fixture L: Rotated Page (${rot} deg)`, { x: 50, y: 750, size: 16, font });

      const tfRot = form.createTextField(`rotated.field.${rot}`);
      tfRot.setText(`Value at ${rot} deg`);
      tfRot.addToPage(page, { x: 50, y: 680, width: 220, height: 30 });
    }

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_L_ROTATED_PAGE.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_L'] = { file: 'FIXTURE_L_ROTATED_PAGE.pdf', size: bytes.length, fields: 4, pages: 4 };
  }

  // =========================================================================
  // FIXTURE M: Non-Standard Page Dimensions
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();

    // Page 1: Wide Banner (1200 x 300)
    const p1 = doc.addPage([1200, 300]);
    p1.drawText('Fixture M: Wide Banner (1200x300 pt)', { x: 50, y: 250, size: 18, font });
    const tfBanner = form.createTextField('banner.headline');
    tfBanner.setText('SPECIAL CAMPAIGN PROMOTION 2026');
    tfBanner.addToPage(p1, { x: 50, y: 150, width: 600, height: 40 });

    // Page 2: Large Blueprint (2592 x 3456)
    const p2 = doc.addPage([2592, 3456]);
    p2.drawText('Fixture M: Architectural Blueprint (2592x3456 pt)', { x: 100, y: 3300, size: 36, font });
    const tfLarge = form.createTextField('blueprint.approver');
    tfLarge.setText('Chief Structural Engineer');
    tfLarge.addToPage(p2, { x: 100, y: 3100, width: 800, height: 70 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_M_UNUSUAL_DIMS.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_M'] = { file: 'FIXTURE_M_UNUSUAL_DIMS.pdf', size: bytes.length, fields: 2, pages: 2 };
  }

  // =========================================================================
  // FIXTURE N: Fields Over Existing Text & Images
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture N: Fields Positioned Over Content', { x: 50, y: 790, size: 18, font });

    // Underlying background graphics & text
    page.drawRectangle({
      x: 45,
      y: 695,
      width: 450,
      height: 60,
      color: rgb(0.9, 0.95, 1.0),
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 1,
    });
    page.drawText('BACKGROUND VECTOR TEXT UNDERNEATH FIELD', {
      x: 55,
      y: 720,
      size: 14,
      font,
      color: rgb(0.5, 0.5, 0.6),
    });

    const form = doc.getForm();
    const tfOver = form.createTextField('overlay.input');
    tfOver.setText('Overlaid Field Text');
    tfOver.addToPage(page, { x: 50, y: 700, width: 350, height: 35 });

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_N_OVERLAY_CONTENT.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_N'] = { file: 'FIXTURE_N_OVERLAY_CONTENT.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE O: Missing Appearance Stream (/AP Omitted)
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture O: Missing Appearance Stream (/AP Omitted)', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    const tfNoAp = form.createTextField('unrendered.value');
    tfNoAp.setText('Rendered Only If Viewer Generates Appearance');
    tfNoAp.addToPage(page, { x: 50, y: 720, width: 400, height: 30 });

    // Strip /AP dictionary from the widget annotation
    const widget = tfNoAp.acroField.getWidgets()[0];
    widget.dict.delete(PDFName.of('AP'));

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_O_MISSING_AP.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_O'] = { file: 'FIXTURE_O_MISSING_AP.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE P: NeedAppearances Flag True
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture P: NeedAppearances Flag True', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    const tfNeed = form.createTextField('need.appearances.field');
    tfNeed.setText('Dynamic Client Render Required');
    tfNeed.addToPage(page, { x: 50, y: 720, width: 350, height: 30 });

    // Set /NeedAppearances true on AcroForm dictionary
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_P_NEED_APPEARANCES.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_P'] = { file: 'FIXTURE_P_NEED_APPEARANCES.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE Q: Malformed / Edge-Case AcroForm
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture Q: Malformed AcroForm (Orphaned Widget)', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    const tfValid = form.createTextField('valid.field');
    tfValid.setText('Valid Field');
    tfValid.addToPage(page, { x: 50, y: 720, width: 200, height: 25 });

    // Manually register an orphaned widget dictionary on the page that is NOT in form fields
    const orphanWidget = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Tx',
      T: PDFString.of('orphaned.field'),
      V: PDFString.of('Orphan Data Without AcroForm Parent'),
      Rect: [50, 650, 300, 680],
      P: page.ref,
    });
    const orphanRef = doc.context.register(orphanWidget);
    page.node.addAnnot(orphanRef);

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_Q_MALFORMED.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_Q'] = { file: 'FIXTURE_Q_MALFORMED.pdf', size: bytes.length, fields: 1, orphanedWidgets: 1 };
  }

  // =========================================================================
  // FIXTURE R: Signature Field
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture R: Cryptographic Signature Placeholder Field', { x: 50, y: 790, size: 18, font });

    const form = doc.getForm();
    page.drawText('Authorized Corporate Signature:', { x: 50, y: 730, size: 12, font });

    // Create signature widget dictionary
    const sigDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: PDFString.of('CorporateSignatureField'),
      Rect: [50, 650, 300, 710],
      P: page.ref,
      F: 4, // Print
    });
    const sigRef = doc.context.register(sigDict);
    page.node.addAnnot(sigRef);
    form.acroForm.addField(sigRef);

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_R_SIGNATURE.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_R'] = { file: 'FIXTURE_R_SIGNATURE.pdf', size: bytes.length, fields: 1 };
  }

  // =========================================================================
  // FIXTURE S: XFA Form (XML Forms Architecture)
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture S: XFA (XML Forms Architecture) Form', { x: 50, y: 790, size: 18, font });
    page.drawText('Notice: This PDF contains a dynamic XML Forms Architecture (/XFA) stream.', { x: 50, y: 730, size: 12, font });

    // Attach an /XFA packet array to a custom /AcroForm dictionary directly on the catalog
    // (Bypasses pdf-lib's getForm().preSave() which aggressively deletes /XFA)
    const xfaStream = doc.context.flateStream(
      '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template><subform name="root"><field name="xfaField"/></subform></template></xdp:xdp>'
    );
    const xfaRef = doc.context.register(xfaStream);

    const acroFormDict = doc.context.obj({
      Fields: [],
      XFA: [PDFString.of('xdp:xdp'), xfaRef],
    });
    const acroRef = doc.context.register(acroFormDict);
    doc.catalog.set(PDFName.of('AcroForm'), acroRef);

    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_S_XFA.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_S'] = { file: 'FIXTURE_S_XFA.pdf', size: bytes.length, fields: 0, hasXfa: true };
  }

  // =========================================================================
  // FIXTURE T: Flattened / Static Visual Form (No AcroForm)
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText('Fixture T: Static Visual Form (Pure Content Stream, No AcroForm)', { x: 50, y: 790, size: 16, font });

    // Draw visual boxes mimicking form inputs
    page.drawText('Full Legal Name:', { x: 50, y: 730, size: 12, font });
    page.drawRectangle({
      x: 180,
      y: 720,
      width: 250,
      height: 25,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
    page.drawText('Johnathan A. Smith (Baked Vector Text)', { x: 190, y: 727, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

    page.drawText('Date of Birth:', { x: 50, y: 670, size: 12, font });
    page.drawRectangle({
      x: 180,
      y: 660,
      width: 150,
      height: 25,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
    page.drawText('1985-11-23', { x: 190, y: 667, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

    // Checkbox box
    page.drawRectangle({
      x: 50,
      y: 610,
      width: 18,
      height: 18,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
    page.drawText('X', { x: 54, y: 613, size: 14, font, color: rgb(0.1, 0.5, 0.1) });
    page.drawText('Registered Voter (Static Checkmark)', { x: 80, y: 613, size: 12, font });

    // Do NOT create form or add widgets
    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'FIXTURE_T_FLATTENED_STATIC.pdf');
    fs.writeFileSync(filePath, bytes);
    summary['FIXTURE_T'] = { file: 'FIXTURE_T_FLATTENED_STATIC.pdf', size: bytes.length, fields: 0, staticVisual: true };
  }

  console.log('✅ Generated all 20 Form Fixtures (A through T) successfully.');
  return summary;
}

generateAllFixtures().then(summary => {
  console.log('\nFixture Generation Summary:');
  console.table(summary);
}).catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
