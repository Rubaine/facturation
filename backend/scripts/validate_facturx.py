"""Valide une facture Factur-X (PDF ou XML) : XSD + schematron EN 16931 + règles françaises BR-FR.

Usage : python scripts/validate_facturx.py facture.pdf [autre.pdf ...]
Nécessite `pip install saxonche` (non requis en production).
"""

import sys
from pathlib import Path

import facturx
from lxml import etree

BASE = Path(facturx.__file__).parent / "xsd_and_schematron"
SCHEMATRONS = {
    "EN16931": BASE / "facturx-en16931" / "FACTUR-X_EN16931.xslt",
    "BR-FR (réforme FR)": BASE / "cii-schematron-fr-ctc" / "BR-FR-Flux2-Schematron-CII.xslt",
}
SVRL = {"svrl": "http://purl.oclc.org/dsdl/svrl"}


def load_xml(path: Path) -> bytes:
    data = path.read_bytes()
    if data.startswith(b"%PDF"):
        _, xml = facturx.get_facturx_xml_from_pdf(data, check_xsd=False)
        if not xml:
            raise SystemExit(f"{path}: aucun XML Factur-X embarqué")
        return xml
    return data


def run_schematron(xml: bytes, xslt: Path) -> list[tuple[str, str, str]]:
    from saxonche import PySaxonProcessor

    with PySaxonProcessor(license=False) as proc:
        x = proc.new_xslt30_processor()
        executable = x.compile_stylesheet(stylesheet_file=str(xslt))
        node = proc.parse_xml(xml_text=xml.decode("utf-8"))
        result = executable.transform_to_string(xdm_node=node)
    tree = etree.fromstring(result.encode("utf-8"))
    issues = []
    for failed in tree.xpath("//svrl:failed-assert | //svrl:successful-report", namespaces=SVRL):
        flag = failed.get("flag") or failed.get("role") or "error"
        text = " ".join("".join(failed.xpath("svrl:text//text()", namespaces=SVRL)).split())
        issues.append((flag, failed.get("id") or "", text))
    return issues


def validate(path: Path) -> bool:
    xml = load_xml(path)
    ok = True
    try:
        facturx.xml_check_xsd(xml, flavor="factur-x", level="en16931")
        print(f"  XSD EN16931 : OK")
    except Exception as exc:  # noqa: BLE001
        print(f"  XSD EN16931 : ÉCHEC - {exc}")
        ok = False
    for name, xslt in SCHEMATRONS.items():
        issues = run_schematron(xml, xslt)
        errors = [i for i in issues if i[0].lower() in ("fatal", "error")]
        status = "OK" if not errors else "ÉCHEC"
        print(f"  Schematron {name} : {status} ({len(errors)} erreur(s), {len(issues) - len(errors)} avertissement(s))")
        for flag, rule, text in issues:
            print(f"    [{flag}] {rule} {text[:300]}")
        ok = ok and not errors
    return ok


if __name__ == "__main__":
    results = []
    for arg in sys.argv[1:]:
        print(arg)
        results.append(validate(Path(arg)))
    sys.exit(0 if all(results) else 1)
