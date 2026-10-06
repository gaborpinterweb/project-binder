#!/usr/bin/env python3
"""Build tiny seed Files-tab binaries (3-page PDF/DOCX, 3-slide PPTX, PNG)."""
from __future__ import annotations

import os
import struct
import zipfile
import zlib

SEED_UPLOADS = os.path.join(os.path.dirname(__file__), "..", "seedUploads")
PROJECT_SLUGS = (
    "aurora-app-launch",
    "cove-brand-redesign",
    "meridian-site-redesign",
    "shopify-store-migration",
)
TAB_SLUG = "files"
LOREM = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
)


def project_files_dir(project_slug: str) -> str:
    return os.path.join(SEED_UPLOADS, project_slug, TAB_SLUG)


def write_png(path: str):
    # 32x32 solid #b45a3c (Aurora seed color), no ancillary chunks.
    w = h = 32
    r, g, b = 0xB4, 0x5A, 0x3C
    raw = b"".join(b"\x00" + bytes([r, g, b]) * w for _ in range(h))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def write_pdf(path: str):
    pages = [
        ("Page 1", LOREM),
        ("Page 2", LOREM),
        ("Page 3", LOREM),
    ]
    font_obj = 3
    page_objs = [4 + i * 2 for i in range(len(pages))]
    content_objs = [5 + i * 2 for i in range(len(pages))]
    kids = " ".join(f"{n} 0 R" for n in page_objs)
    bodies = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for i, (title, body) in enumerate(pages):
        page_n = page_objs[i]
        content_n = content_objs[i]
        stream = (
            "BT /F1 16 Tf 72 720 Td ("
            + _pdf_escape(title)
            + ") Tj 0 -28 Td /F1 12 Tf ("
            + _pdf_escape(body[:72])
            + ") Tj 0 -16 Td ("
            + _pdf_escape(body[72:].strip())
            + ") Tj ET"
        )
        bodies.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_obj} 0 R >> >> /Contents {content_n} 0 R >>"
        )
        bodies.append(f"<< /Length {len(stream.encode('latin1'))} >>\nstream\n{stream}\nendstream")
        assert page_n == 4 + i * 2 and content_n == 5 + i * 2

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(bodies, start=1):
        offsets.append(len(out))
        out.extend(f"{i} 0 obj\n{body}\nendobj\n".encode("latin1"))
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(bodies) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    out.extend(
        (
            f"trailer << /Size {len(bodies) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode("ascii")
    )
    with open(path, "wb") as f:
        f.write(out)


def _pdf_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_docx(path: str):
    paras = []
    for i in range(1, 4):
        if i > 1:
            paras.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        ppr = '<w:pPr><w:pageBreakBefore/></w:pPr>' if i > 1 else ""
        paras.append(
            f"<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">Page {i}</w:t></w:r></w:p>"
            f'<w:p><w:r><w:t xml:space="preserve">{LOREM}</w:t></w:r></w:p>'
        )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        + "".join(paras)
        + "<w:sectPr/>"
        "</w:body></w:document>"
    )
    types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", doc_rels)


def write_pptx(path: str):
    slides = [
        ("Slide 1", LOREM),
        ("Slide 2", LOREM),
        ("Slide 3", LOREM),
    ]
    ns_p = "http://schemas.openxmlformats.org/presentationml/2006/main"
    ns_a = "http://schemas.openxmlformats.org/drawingml/2006/main"
    ns_r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    ns_pkg = "http://schemas.openxmlformats.org/package/2006/relationships"

    def slide_xml(title: str, body: str) -> str:
        return (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<p:sld xmlns:a="{ns_a}" xmlns:r="{ns_r}" xmlns:p="{ns_p}">'
            "<p:cSld><p:spTree>"
            "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"
            "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>"
            "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
            "<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/>"
            "</p:nvSpPr><p:spPr><a:xfrm><a:off x=\"457200\" y=\"274638\"/>"
            "<a:ext cx=\"8229600\" cy=\"1143000\"/></a:xfrm>"
            "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr>"
            "<p:txBody><a:bodyPr/><a:lstStyle/>"
            f'<a:p><a:r><a:rPr lang="en-US" sz="2800"/><a:t>{_xml(title)}</a:t></a:r></a:p>'
            "</p:txBody></p:sp>"
            "<p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Body 2\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/>"
            "</p:nvSpPr><p:spPr><a:xfrm><a:off x=\"457200\" y=\"1600200\"/>"
            "<a:ext cx=\"8229600\" cy=\"2971800\"/></a:xfrm>"
            "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr>"
            "<p:txBody><a:bodyPr/><a:lstStyle/>"
            f'<a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>{_xml(body)}</a:t></a:r></a:p>'
            "</p:txBody></p:sp>"
            "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
        )

    layout = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<p:sldLayout xmlns:a="{ns_a}" xmlns:r="{ns_r}" xmlns:p="{ns_p}" type="blank" preserve="1">'
        "<p:cSld name=\"Blank\"><p:spTree>"
        "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"
        "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>"
        "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
        "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
    )
    master = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<p:sldMaster xmlns:a="{ns_a}" xmlns:r="{ns_r}" xmlns:p="{ns_p}">'
        "<p:cSld><p:bg><p:bgRef idx=\"1001\"><a:schemeClr val=\"bg1\"/></p:bgRef></p:bg><p:spTree>"
        "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"
        "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>"
        "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
        "</p:spTree></p:cSld>"
        "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" "
        "accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" "
        "accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>"
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
        "</p:sldMaster>"
    )
    theme = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<a:theme xmlns:a="{ns_a}" name="Office">'
        "<a:themeElements>"
        "<a:clrScheme name=\"Office\">"
        "<a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1>"
        "<a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>"
        "<a:dk2><a:srgbClr val=\"1F497D\"/></a:dk2><a:lt2><a:srgbClr val=\"EEECE1\"/></a:lt2>"
        "<a:accent1><a:srgbClr val=\"4F81BD\"/></a:accent1>"
        "<a:accent2><a:srgbClr val=\"C0504D\"/></a:accent2>"
        "<a:accent3><a:srgbClr val=\"9BBB59\"/></a:accent3>"
        "<a:accent4><a:srgbClr val=\"8064A2\"/></a:accent4>"
        "<a:accent5><a:srgbClr val=\"4BACC6\"/></a:accent5>"
        "<a:accent6><a:srgbClr val=\"F79646\"/></a:accent6>"
        "<a:hlink><a:srgbClr val=\"0000FF\"/></a:hlink>"
        "<a:folHlink><a:srgbClr val=\"800080\"/></a:folHlink>"
        "</a:clrScheme>"
        "<a:fontScheme name=\"Office\">"
        "<a:majorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont>"
        "<a:minorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont>"
        "</a:fontScheme>"
        "<a:fmtScheme name=\"Office\">"
        "<a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
        "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
        "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:fillStyleLst>"
        "<a:lnStyleLst>"
        + (
            "<a:ln w=\"9525\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\">"
            "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
            "<a:prstDash val=\"solid\"/></a:ln>"
        )
        * 3
        + "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>"
        "<a:effectStyle><a:effectLst/></a:effectStyle>"
        "<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>"
        "<a:bgFillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
        "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
        "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:bgFillStyleLst>"
        "</a:fmtScheme></a:themeElements></a:theme>"
    )
    sld_ids = "".join(
        f'<p:sldId id="{256 + i}" r:id="rId{i + 2}"/>' for i in range(len(slides))
    )
    presentation = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<p:presentation xmlns:a="{ns_a}" xmlns:r="{ns_r}" xmlns:p="{ns_p}">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f"<p:sldIdLst>{sld_ids}</p:sldIdLst>"
        '<p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/>'
        "</p:presentation>"
    )
    types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        + "".join(
            f'<Override PartName="/ppt/slides/slide{i}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
            for i in range(1, len(slides) + 1)
        )
        + "</Types>"
    )
    pkg_rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{ns_pkg}">'
        f'<Relationship Id="rId1" Type="{ns_r}/officeDocument" Target="ppt/presentation.xml"/>'
        "</Relationships>"
    )
    pres_rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{ns_pkg}">'
        f'<Relationship Id="rId1" Type="{ns_r}/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
        + "".join(
            f'<Relationship Id="rId{i + 2}" Type="{ns_r}/slide" Target="slides/slide{i + 1}.xml"/>'
            for i in range(len(slides))
        )
        + "</Relationships>"
    )
    slide_rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{ns_pkg}">'
        f'<Relationship Id="rId1" Type="{ns_r}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        "</Relationships>"
    )
    layout_rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{ns_pkg}">'
        f'<Relationship Id="rId1" Type="{ns_r}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        "</Relationships>"
    )
    master_rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{ns_pkg}">'
        f'<Relationship Id="rId1" Type="{ns_r}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        f'<Relationship Id="rId2" Type="{ns_r}/theme" Target="../theme/theme1.xml"/>'
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("_rels/.rels", pkg_rels)
        z.writestr("ppt/presentation.xml", presentation)
        z.writestr("ppt/_rels/presentation.xml.rels", pres_rels)
        z.writestr("ppt/slideMasters/slideMaster1.xml", master)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", master_rels)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", layout)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout_rels)
        z.writestr("ppt/theme/theme1.xml", theme)
        for i, (title, body) in enumerate(slides, start=1):
            z.writestr(f"ppt/slides/slide{i}.xml", slide_xml(title, body))
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", slide_rels)


def _xml(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def main():
    writers = {
        "press-kit-pdf": write_pdf,
        "launch-brief-docx": write_docx,
        "launch-deck-pptx": write_pptx,
        "hero-mock-png": write_png,
    }
    sizes = {}
    for project in PROJECT_SLUGS:
        root = project_files_dir(project)
        os.makedirs(root, exist_ok=True)
        for name, fn in writers.items():
            path = os.path.join(root, name)
            fn(path)
            sizes[name] = os.path.getsize(path)
            print(f"{project}/{name}\t{sizes[name]}")
    print("SIZES", sizes)


if __name__ == "__main__":
    main()
