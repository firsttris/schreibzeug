import { escapeXml, officePackage, XML_HEADER } from "./zip";

/**
 * A minimal presentation (ECMA-376 Part 1, 19): one master with the four layouts people start
 * from, a theme with Office's default colours and Calibri, and the slides given. 16:9, in German.
 */

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS = `xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"`;
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument.presentationml";

/** The layouts of the master, by the names PowerPoint gives them in German. */
export type SlideLayout = "title" | "content" | "titleOnly" | "blank";

/** One slide: its layout and the texts of its placeholders. */
export type Slide = { layout: SlideLayout; title?: string; subtitle?: string; bullets?: string[] };

type Placeholder = { type: string; idx?: number };

/** Where things sit on a 16:9 slide (12192000 × 6858000 EMU), as in PowerPoint's default master. */
const BOXES = {
  title: { x: 838200, y: 365125, cx: 10515600, cy: 1325563 },
  body: { x: 838200, y: 1825625, cx: 10515600, cy: 4351338 },
  ctrTitle: { x: 1524000, y: 1122363, cx: 9144000, cy: 2387600 },
  subTitle: { x: 1524000, y: 3602038, cx: 9144000, cy: 1655762 },
} as const;

const LAYOUTS: Record<
  SlideLayout,
  { file: number; type: string; name: string; placeholders: Placeholder[] }
> = {
  title: {
    file: 1,
    type: "title",
    name: "Titelfolie",
    placeholders: [{ type: "ctrTitle" }, { type: "subTitle", idx: 1 }],
  },
  content: {
    file: 2,
    type: "obj",
    name: "Titel und Inhalt",
    placeholders: [{ type: "title" }, { type: "body", idx: 1 }],
  },
  titleOnly: { file: 3, type: "titleOnly", name: "Nur Titel", placeholders: [{ type: "title" }] },
  blank: { file: 4, type: "blank", name: "Leer", placeholders: [] },
};

const LAYOUT_ORDER: SlideLayout[] = ["title", "content", "titleOnly", "blank"];

const groupProperties =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const xfrm = ({ x, y, cx, cy }: { x: number; y: number; cx: number; cy: number }) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;

const phXml = ({ type, idx }: Placeholder) =>
  `<p:ph type="${type}"${idx === undefined ? "" : ` idx="${idx}"`}/>`;

const paragraphs = (texts: string[]): string =>
  texts.length === 0
    ? '<a:p><a:endParaRPr lang="de-DE"/></a:p>'
    : texts
        .map((text) => `<a:p><a:r><a:rPr lang="de-DE"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>`)
        .join("");

/** A placeholder shape (ECMA-376 Part 1, 19.3.1.43); position and look come from above when absent. */
const placeholderShape = (
  id: number,
  placeholder: Placeholder,
  texts: string[],
  extra: { box?: string; bodyPr?: string; lstStyle?: string } = {},
) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${placeholder.type} ${id - 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
  `<p:nvPr>${phXml(placeholder)}</p:nvPr></p:nvSpPr>` +
  `<p:spPr>${extra.box ?? ""}</p:spPr>` +
  `<p:txBody>${extra.bodyPr ?? "<a:bodyPr/>"}${extra.lstStyle ?? "<a:lstStyle/>"}${paragraphs(texts)}</p:txBody></p:sp>`;

const level = (n: number, margin: number, size: number, bullet: boolean) =>
  `<a:lvl${n}pPr marL="${margin}" indent="${bullet ? -228600 : 0}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
  '<a:lnSpc><a:spcPct val="90000"/></a:lnSpc>' +
  `<a:spcBef>${bullet ? '<a:spcPts val="1000"/>' : '<a:spcPct val="0"/>'}</a:spcBef>` +
  (bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : "<a:buNone/>") +
  `<a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
  '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>' +
  `</a:lvl${n}pPr>`;

const textStyles =
  "<p:txStyles>" +
  '<p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">' +
  '<a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/>' +
  '<a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>' +
  '<a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
  `<p:bodyStyle>${level(1, 228600, 2800, true)}${level(2, 685800, 2400, true)}${level(3, 1143000, 2000, true)}</p:bodyStyle>` +
  `<p:otherStyle><a:defPPr><a:defRPr lang="de-DE"/></a:defPPr>${level(1, 0, 1800, false)}</p:otherStyle>` +
  "</p:txStyles>";

const colorMap =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
  'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

const master = () =>
  `${XML_HEADER}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>` +
  `<p:spTree>${groupProperties}` +
  placeholderShape(2, { type: "title" }, ["Titelmasterformat durch Klicken bearbeiten"], {
    box: `${xfrm(BOXES.title)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    bodyPr:
      '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"><a:normAutofit/></a:bodyPr>',
  }) +
  placeholderShape(3, { type: "body", idx: 1 }, ["Mastertextformat bearbeiten"], {
    box: `${xfrm(BOXES.body)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    bodyPr:
      '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"><a:normAutofit/></a:bodyPr>',
  }) +
  `</p:spTree></p:cSld>${colorMap}` +
  `<p:sldLayoutIdLst>${LAYOUT_ORDER.map((_, index) => `<p:sldLayoutId id="${2147483649 + index}" r:id="rId${index + 1}"/>`).join("")}</p:sldLayoutIdLst>` +
  `${textStyles}</p:sldMaster>`;

const centered = (size: number, bullet = false) =>
  `<a:lstStyle><a:lvl1pPr algn="ctr">${bullet ? "" : "<a:buNone/>"}<a:defRPr sz="${size}"/></a:lvl1pPr></a:lstStyle>`;

const layout = (key: SlideLayout) => {
  const { type, name, placeholders } = LAYOUTS[key];
  const shapes = placeholders
    .map((placeholder, index) => {
      if (placeholder.type === "ctrTitle") {
        return placeholderShape(index + 2, placeholder, ["Titel hinzufügen"], {
          box: xfrm(BOXES.ctrTitle),
          bodyPr: '<a:bodyPr anchor="b"><a:normAutofit/></a:bodyPr>',
          lstStyle: centered(6000),
        });
      }
      if (placeholder.type === "subTitle") {
        return placeholderShape(index + 2, placeholder, ["Untertitel hinzufügen"], {
          box: xfrm(BOXES.subTitle),
          bodyPr: "<a:bodyPr><a:normAutofit/></a:bodyPr>",
          lstStyle: centered(2400),
        });
      }
      return placeholderShape(index + 2, placeholder, [
        placeholder.type === "title" ? "Titel hinzufügen" : "Text hinzufügen",
      ]);
    })
    .join("");
  return (
    `${XML_HEADER}<p:sldLayout ${NS} type="${type}" preserve="1"><p:cSld name="${name}"><p:spTree>${groupProperties}${shapes}</p:spTree></p:cSld>` +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
  );
};

const slideXml = ({ layout: key, title, subtitle, bullets = [] }: Slide) => {
  const shapes = LAYOUTS[key].placeholders
    .map((placeholder, index) => {
      const texts =
        placeholder.type === "ctrTitle" || placeholder.type === "title"
          ? title
            ? [title]
            : []
          : placeholder.type === "subTitle"
            ? subtitle
              ? [subtitle]
              : []
            : bullets;
      return placeholderShape(index + 2, placeholder, texts);
    })
    .join("");
  return (
    `${XML_HEADER}<p:sld ${NS}><p:cSld><p:spTree>${groupProperties}${shapes}</p:spTree></p:cSld>` +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
  );
};

const solid = (color: string) => `<a:solidFill><a:schemeClr val="${color}"/></a:solidFill>`;

/** Office's default colours and Calibri (Light) for headings and text. */
const theme = () =>
  `${XML_HEADER}<a:theme xmlns:a="${A}" name="Schreibzeug"><a:themeElements>` +
  '<a:clrScheme name="Office">' +
  '<a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
  "</a:clrScheme>" +
  '<a:fontScheme name="Office">' +
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
  "</a:fontScheme>" +
  '<a:fmtScheme name="Office">' +
  `<a:fillStyleLst>${solid("phClr").repeat(3)}</a:fillStyleLst>` +
  `<a:lnStyleLst>${[6350, 12700, 19050].map((width) => `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">${solid("phClr")}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`).join("")}</a:lnStyleLst>` +
  `<a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst>` +
  `<a:bgFillStyleLst>${solid("phClr").repeat(3)}</a:bgFillStyleLst>` +
  "</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>";

const relationships = (items: Array<{ type: string; target: string }>) =>
  `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  items
    .map(
      ({ type, target }, index) =>
        `<Relationship Id="rId${index + 1}" Type="${REL}/${type}" Target="${target}"/>`,
    )
    .join("") +
  "</Relationships>";

/** A presentation with the given slides. */
export const pptx = (slides: Slide[]): Uint8Array => {
  const layoutFiles = Object.fromEntries(
    LAYOUT_ORDER.flatMap((key) => {
      const file = LAYOUTS[key].file;
      return [
        [`ppt/slideLayouts/slideLayout${file}.xml`, layout(key)],
        [
          `ppt/slideLayouts/_rels/slideLayout${file}.xml.rels`,
          relationships([{ type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]),
        ],
      ];
    }),
  );
  const slideFiles = Object.fromEntries(
    slides.flatMap((slide, index) => [
      [`ppt/slides/slide${index + 1}.xml`, slideXml(slide)],
      [
        `ppt/slides/_rels/slide${index + 1}.xml.rels`,
        relationships([
          { type: "slideLayout", target: `../slideLayouts/slideLayout${LAYOUTS[slide.layout].file}.xml` },
        ]),
      ],
    ]),
  );
  const presentationRels = [
    { type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
    { type: "theme", target: "theme/theme1.xml" },
    { type: "presProps", target: "presProps.xml" },
    { type: "viewProps", target: "viewProps.xml" },
    { type: "tableStyles", target: "tableStyles.xml" },
    ...slides.map((_, index) => ({ type: "slide", target: `slides/slide${index + 1}.xml` })),
  ];
  const firstSlideRel = presentationRels.length - slides.length + 1;

  return officePackage({
    "[Content_Types].xml":
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      `<Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/>` +
      LAYOUT_ORDER.map(
        (key) =>
          `<Override PartName="/ppt/slideLayouts/slideLayout${LAYOUTS[key].file}.xml" ContentType="${CT}.slideLayout+xml"/>`,
      ).join("") +
      slides
        .map(
          (_, index) =>
            `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="${CT}.slide+xml"/>`,
        )
        .join("") +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      `<Override PartName="/ppt/presProps.xml" ContentType="${CT}.presProps+xml"/>` +
      `<Override PartName="/ppt/viewProps.xml" ContentType="${CT}.viewProps+xml"/>` +
      `<Override PartName="/ppt/tableStyles.xml" ContentType="${CT}.tableStyles+xml"/>` +
      "</Types>",
    "_rels/.rels": relationships([{ type: "officeDocument", target: "ppt/presentation.xml" }]),
    "ppt/presentation.xml":
      `${XML_HEADER}<p:presentation ${NS} saveSubsetFonts="1">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${firstSlideRel + index}"/>`).join("")}</p:sldIdLst>` +
      '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
      `<p:defaultTextStyle><a:defPPr><a:defRPr lang="de-DE"/></a:defPPr>${level(1, 0, 1800, false)}</p:defaultTextStyle>` +
      "</p:presentation>",
    "ppt/_rels/presentation.xml.rels": relationships(presentationRels),
    "ppt/slideMasters/slideMaster1.xml": master(),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": relationships([
      ...LAYOUT_ORDER.map((key) => ({
        type: "slideLayout",
        target: `../slideLayouts/slideLayout${LAYOUTS[key].file}.xml`,
      })),
      { type: "theme", target: "../theme/theme1.xml" },
    ]),
    "ppt/theme/theme1.xml": theme(),
    "ppt/presProps.xml": `${XML_HEADER}<p:presentationPr ${NS}/>`,
    "ppt/viewProps.xml": `${XML_HEADER}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`,
    "ppt/tableStyles.xml": `${XML_HEADER}<a:tblStyleLst xmlns:a="${A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    ...layoutFiles,
    ...slideFiles,
  });
};

/** A new presentation: one empty title slide. */
export const blankPptx = (): Uint8Array => pptx([{ layout: "title" }]);
