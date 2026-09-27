import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function generatePhase6cFixtures() {
  const fixturesDir = path.resolve('test-fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  console.log('Generating Phase 6C test fixtures...');

  // =========================================================================
  // FIXTURE 1: phase6c-real-form.pdf
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const form = doc.getForm();

    // PAGE 1
    const p1 = doc.addPage([595, 842]);
    p1.drawText('Phase 6C Real Form Fixture — Page 1', { x: 50, y: 800, size: 16, font: fontBold });

    // Multi-widget field (on p1 and p2)
    const headerTitle = form.createTextField('document.titleHeader');
    headerTitle.addToPage(p1, { x: 50, y: 760, width: 300, height: 22 });
    headerTitle.setText('Phase 6C Form Document');
    p1.drawText('Document Title Header (Multi-widget):', { x: 50, y: 785, size: 10, font });

    // Text Field: applicant.fullName
    p1.drawText('Full Name:', { x: 50, y: 735, size: 11, font });
    const fullName = form.createTextField('applicant.fullName');
    fullName.addToPage(p1, { x: 50, y: 710, width: 250, height: 22 });
    fullName.setText('Jane Doe');

    // Multiline Field: applicant.biography
    p1.drawText('Biography (Multiline):', { x: 50, y: 690, size: 11, font });
    const bio = form.createTextField('applicant.biography');
    bio.enableMultiline();
    bio.addToPage(p1, { x: 50, y: 600, width: 350, height: 85 });
    bio.setText('Line 1: Senior Software Engineer\nLine 2: Leading PDF Architecture\nLine 3: Verified for Phase 6C');

    // Password Field: applicant.passcode
    p1.drawText('Security Passcode (Password):', { x: 50, y: 580, size: 11, font });
    const pass = form.createTextField('applicant.passcode');
    // Set password flag (bit 14 in AcroField)
    pass.acroField.dict.set(doc.context.obj('Ff'), doc.context.obj(8192)); // 1 << 13
    pass.addToPage(p1, { x: 50, y: 555, width: 200, height: 22 });
    pass.setText('SecretPass123');

    // Checkbox: applicant.agreeTerms
    p1.drawText('Agree to Terms & Conditions:', { x: 80, y: 522, size: 11, font });
    const agree = form.createCheckBox('applicant.agreeTerms');
    agree.addToPage(p1, { x: 50, y: 518, width: 18, height: 18 });
    agree.check();

    // Radio Group: applicant.planTier
    p1.drawText('Select Subscription Plan Tier:', { x: 50, y: 490, size: 11, font });
    const plan = form.createRadioGroup('applicant.planTier');
    plan.addOptionToPage('Standard', p1, { x: 50, y: 460, width: 18, height: 18 });
    p1.drawText('Standard Plan', { x: 78, y: 464, size: 11, font });

    plan.addOptionToPage('Pro', p1, { x: 180, y: 460, width: 18, height: 18 });
    p1.drawText('Pro Plan (Selected)', { x: 208, y: 464, size: 11, font });

    plan.addOptionToPage('Enterprise', p1, { x: 340, y: 460, width: 18, height: 18 });
    p1.drawText('Enterprise Plan', { x: 368, y: 464, size: 11, font });

    plan.select('Pro');

    // Dropdown: applicant.country
    p1.drawText('Country / Region:', { x: 50, y: 425, size: 11, font });
    const country = form.createDropdown('applicant.country');
    country.addOptions(['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia', 'Japan']);
    country.addToPage(p1, { x: 50, y: 395, width: 220, height: 24 });
    country.select('Canada');

    // PAGE 2
    const p2 = doc.addPage([595, 842]);
    p2.drawText('Phase 6C Real Form Fixture — Page 2', { x: 50, y: 800, size: 16, font: fontBold });

    // Multi-widget field headerTitle on p2
    headerTitle.addToPage(p2, { x: 50, y: 760, width: 300, height: 22 });
    p2.drawText('Document Title Header (Multi-widget instance 2):', { x: 50, y: 785, size: 10, font });

    // Listbox: applicant.skills
    p2.drawText('Technical Skills (Multi-select Listbox):', { x: 50, y: 735, size: 11, font });
    const skills = form.createOptionList('applicant.skills');
    skills.addOptions(['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'C++', 'SQL']);
    skills.addToPage(p2, { x: 50, y: 620, width: 220, height: 110 });
    skills.select(['TypeScript', 'Rust']);

    // Required field: company.taxId
    p2.drawText('Corporate Tax ID (Required *):', { x: 50, y: 590, size: 11, font });
    const taxId = form.createTextField('company.taxId');
    taxId.enableRequired();
    taxId.addToPage(p2, { x: 50, y: 565, width: 220, height: 22 });
    taxId.setText('TAX-987654321');

    // Read-only field: system.generatedId
    p2.drawText('System Reference ID (Read-Only):', { x: 50, y: 535, size: 11, font });
    const sysId = form.createTextField('system.generatedId');
    sysId.enableReadOnly();
    sysId.addToPage(p2, { x: 50, y: 510, width: 220, height: 22 });
    sysId.setText('SYS-REC-2026-X99');

    // Hierarchical field name: billing.address.street
    p2.drawText('Billing Street Address (Hierarchical):', { x: 50, y: 480, size: 11, font });
    const street = form.createTextField('billing.address.street');
    street.addToPage(p2, { x: 50, y: 455, width: 300, height: 22 });
    street.setText('742 Evergreen Terrace');

    // PAGE 3: Ordinary PDF Content
    const p3 = doc.addPage([595, 842]);
    p3.drawText('Phase 6C Real Form Fixture — Page 3 (Non-Form Content)', { x: 50, y: 800, size: 16, font: fontBold });
    p3.drawText('Section 3: Standard Confidentiality Terms and Legal Declarations', { x: 50, y: 760, size: 12, font: fontBold });
    p3.drawText('1. All form interactions and document processing take place entirely on client hardware.', { x: 50, y: 730, size: 10, font });
    p3.drawText('2. No document bytes, form field entries, or metadata are transmitted to external servers.', { x: 50, y: 710, size: 10, font });
    p3.drawText('3. This page contains static vector text and graphics with zero AcroForm widgets.', { x: 50, y: 690, size: 10, font });

    const p1Bytes = await doc.save();
    const p1Path = path.join(fixturesDir, 'phase6c-real-form.pdf');
    fs.writeFileSync(p1Path, p1Bytes);
    console.log(`Saved: ${p1Path} (${p1Bytes.length} bytes, 3 pages)`);
  }

  // =========================================================================
  // FIXTURE 2: phase6c-redaction-form.pdf
  // =========================================================================
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const form = doc.getForm();

    // PAGE 1
    const p1 = doc.addPage([595, 842]);
    p1.drawText('Confidential Government Document with Sensitive Form Fields', { x: 50, y: 800, size: 16, font: fontBold });
    p1.drawText('Page 1: Subject to Strict Forensic Redaction Validation', { x: 50, y: 775, size: 11, font });

    // Secret Form Field: confidential.ssn (Page 1)
    p1.drawText('Confidential Social Security Number (SECRET CANARY):', { x: 50, y: 720, size: 11, font });
    const secretField = form.createTextField('confidential.ssn');
    secretField.addToPage(p1, { x: 50, y: 685, width: 260, height: 26 });
    secretField.setText('SUPER_SECRET_FORM_VALUE_6C');

    // Static text on Page 1
    p1.drawText('Notice: Any redactions applied over field areas must obliterate both the visual pixels', { x: 50, y: 620, size: 9, font });
    p1.drawText('and the underlying AcroForm dictionary entries so no canaries leak.', { x: 50, y: 605, size: 9, font });

    // PAGE 2: Unaffected Page with Valid Form Field
    const p2 = doc.addPage([595, 842]);
    p2.drawText('Page 2: Standard Appendices & Public Disclosures', { x: 50, y: 800, size: 16, font: fontBold });
    p2.drawText('This secondary page is completely unaffected by redactions and contains a normal interactive field.', { x: 50, y: 760, size: 10, font });

    // Unaffected Form Field: applicant.publicName on Page 2
    p2.drawText('Applicant Public Name (Unaffected):', { x: 50, y: 720, size: 11, font });
    const publicField = form.createTextField('applicant.publicName');
    publicField.addToPage(p2, { x: 50, y: 685, width: 260, height: 26 });
    publicField.setText('Public Citizen');

    const p2Bytes = await doc.save();
    const p2Path = path.join(fixturesDir, 'phase6c-redaction-form.pdf');
    fs.writeFileSync(p2Path, p2Bytes);
    console.log(`Saved: ${p2Path} (${p2Bytes.length} bytes, 2 pages)`);
  }

  console.log('Phase 6C test fixtures generated successfully!');
}

generatePhase6cFixtures().catch((err) => {
  console.error('Failed to generate Phase 6C fixtures:', err);
  process.exit(1);
});
