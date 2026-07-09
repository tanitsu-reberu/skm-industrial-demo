import fs from "node:fs";
import path from "node:path";
import { AlignmentType, Document, Footer, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { getAdminGuideSections } from "./admin-guide-sections.mjs";
import { numberingConfig, paragraphStyles } from "./docx-shared.mjs";

import { agreementsOutputPaths } from "./docx-output-paths.mjs";

const outputPaths = agreementsOutputPaths("Инструкция администратора СКМ.docx");

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles,
  },
  numbering: { config: numberingConfig },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("ООО СКМ — инструкция администратора | Стр. "),
                new TextRun({ children: [PageNumber.CURRENT] }),
              ],
            }),
          ],
        }),
      },
      children: getAdminGuideSections(),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);

for (const outputPath of outputPaths) {
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    console.log("Saved:", outputPath);
  } catch (error) {
    console.error("Failed:", outputPath, error.message);
  }
}