import JSZip from 'jszip';
import RNFS from 'react-native-fs';
import {Page} from '../types/models';
import {setPageOcrText} from '../db/database';
import {ensureExportsDir} from './fileStorage';
import {recognizeTextFromImage} from './ocr';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text: string, opts?: {bold?: boolean; size?: number}): string {
  const rPr =
    (opts?.bold ? '<w:b/>' : '') +
    (opts?.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : '');
  const rPrXml = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
  return `<w:p><w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function pageBreakParagraph(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * Builds a minimal but valid .docx (OOXML) directly instead of pulling in a
 * full document-building library - this only ever needs plain paragraphs of
 * the page's already-OCR'd text (one "Page N" section per page, separated
 * by a page break), so hand-writing the XML keeps the dependency footprint
 * to just a zip library (`jszip`) rather than a whole docx-authoring stack.
 * Pages without cached OCR text get OCR'd on the spot and the result is
 * cached back onto the page, same as the page-action "Extract Text" flow.
 *
 * Deliberately text-only, not a picture of the page: a version that
 * embedded each page as an image (to carry over tables/photos exactly as
 * they look) was tried and reverted - the point of exporting to Word is
 * editable/searchable text, and a page-sized picture working against that
 * wasn't the right trade-off. OCR only reads text, so a table's cell
 * structure or an embedded photo still won't carry over; the PDF export
 * remains the way to get an exact visual copy of the page.
 */
export async function buildDocxFromPages(
  pages: Page[],
  title: string,
): Promise<string> {
  const bodyParts: string[] = [paragraph(title, {bold: true, size: 32})];

  for (const page of pages) {
    let text = page.ocrText;
    if (!text) {
      try {
        text = await recognizeTextFromImage(page.filePath);
        if (text) {
          await setPageOcrText(page.id, text);
        }
      } catch {
        text = '';
      }
    }

    bodyParts.push(pageBreakParagraph());
    bodyParts.push(paragraph(`Page ${page.pageIndex + 1}`, {bold: true, size: 24}));

    const lines = (text ?? '').split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      bodyParts.push(paragraph('(No text recognized on this page.)'));
    } else {
      for (const line of lines) {
        bodyParts.push(paragraph(line));
      }
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${bodyParts.join('\n')}
<w:sectPr/>
</w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', ROOT_RELS);
  zip.folder('word')!.file('document.xml', documentXml);

  const base64 = await zip.generateAsync({type: 'base64'});
  const exportsDir = await ensureExportsDir();
  const safeTitle = title.replace(/[^\w\- ]/g, '').trim() || 'document';
  const outputPath = `${exportsDir}/${safeTitle}.docx`;
  await RNFS.writeFile(outputPath, base64, 'base64');
  return outputPath;
}
