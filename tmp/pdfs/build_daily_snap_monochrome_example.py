from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas


OUT = Path("output/pdf/daily-snap-monochrome-example.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
MARGIN = 10 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

BLACK = colors.HexColor("#000000")
DARK = colors.HexColor("#303030")
MID = colors.HexColor("#D9D9D9")
LIGHT = colors.HexColor("#EEEEEE")
PALE = colors.HexColor("#F6F6F6")
BORDER = colors.HexColor("#C9C9C9")
WHITE = colors.white


def text(c, value, x, y, size=7, bold=False, align="left", color=BLACK):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    if align == "right":
        c.drawRightString(x, y, value)
    elif align == "center":
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)


def rounded_box(c, x, y, w, h, fill=WHITE, radius=2.5 * mm):
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def kpi(c, x, y, w, h, label, value, sub=""):
    rounded_box(c, x, y, w, h, PALE)
    text(c, label.upper(), x + 3 * mm, y + h - 5 * mm, 5.7, True, color=DARK)
    text(c, value, x + 3 * mm, y + h - 12 * mm, 11, True)
    if sub:
        text(c, sub, x + 3 * mm, y + 3.5 * mm, 5.5, color=DARK)


def section_header(c, x, y, w, title):
    c.setFillColor(MID)
    c.rect(x, y - 8 * mm, w, 8 * mm, fill=1, stroke=0)
    text(c, title, x + 3 * mm, y - 5.2 * mm, 7.2, True)


def table(c, x, y, widths, headers, rows, row_h=6 * mm, aligns=None):
    total_w = sum(widths)
    c.setLineWidth(0.45)
    c.setStrokeColor(BORDER)
    c.setFillColor(LIGHT)
    c.rect(x, y - row_h, total_w, row_h, fill=1, stroke=1)
    xx = x
    for i, (header, width) in enumerate(zip(headers, widths)):
        align = (aligns or ["left"] * len(headers))[i]
        tx = xx + 2 * mm if align == "left" else xx + width - 2 * mm
        text(c, header, tx, y - 4 * mm, 5.8, True, align=align)
        xx += width
        if i < len(widths) - 1:
            c.line(xx, y - row_h, xx, y)
    yy = y - row_h
    for ri, row in enumerate(rows):
        c.setFillColor(PALE if ri == len(rows) - 1 else WHITE)
        c.rect(x, yy - row_h, total_w, row_h, fill=1, stroke=1)
        xx = x
        for i, (value, width) in enumerate(zip(row, widths)):
            align = (aligns or ["left"] * len(headers))[i]
            tx = xx + 2 * mm if align == "left" else xx + width - 2 * mm
            text(c, str(value), tx, yy - 4 * mm, 5.8, ri == len(rows) - 1, align)
            xx += width
            if i < len(widths) - 1:
                c.line(xx, yy - row_h, xx, yy)
        yy -= row_h
    return yy


c = Canvas(str(OUT), pagesize=A4)
c.setTitle("Daily Snap - Monochrome Export Example")
c.setAuthor("SS Ops HUB")

y = PAGE_H - MARGIN

# Report header
text(c, "ORILLA", MARGIN, y - 4 * mm, 12, True)
text(c, "CLOSING REPORT - DAILY SNAP", PAGE_W / 2, y - 3.5 * mm, 13, True, "center")
text(c, "Week 39  |  27 September 2026  |  Sunday", PAGE_W / 2, y - 9.5 * mm, 7, False, "center", DARK)
c.setStrokeColor(BLACK)
c.setLineWidth(1)
c.line(MARGIN, y - 13 * mm, PAGE_W - MARGIN, y - 13 * mm)
y -= 18 * mm

# KPI row
gap = 2 * mm
kpi_w = (CONTENT_W - 4 * gap) / 5
kpis = [
    ("Total Revenue", "1,357.00", "Net 1,107.76"),
    ("Lunch Revenue", "0.00", "Net 0.00"),
    ("Dinner Revenue", "1,357.00", "Net 1,107.76"),
    ("Covers", "6", "0 walk-in"),
    ("Avg Spend", "226.17", "Per cover"),
]
for i, item in enumerate(kpis):
    kpi(c, MARGIN + i * (kpi_w + gap), y - 21 * mm, kpi_w, 21 * mm, *item)
y -= 26 * mm

# Target row
target_w = (CONTENT_W - 2 * gap) / 3
targets = [
    ("DAY TARGET", "1,357.00 / 24,130.93", "-94.4%"),
    ("WEEK TARGET", "71,161.98 / 90,000.00", "-20.9%"),
    ("MONTH TARGET", "326,911.48 / 450,000.00", "-8.5%"),
]
for i, (label, value, variance) in enumerate(targets):
    x = MARGIN + i * (target_w + gap)
    rounded_box(c, x, y - 18 * mm, target_w, 18 * mm, LIGHT)
    text(c, label, x + 3 * mm, y - 5 * mm, 6, True)
    text(c, value, x + 3 * mm, y - 11 * mm, 7.5, True)
    text(c, variance, x + target_w - 3 * mm, y - 11 * mm, 7.5, True, "right")
y -= 23 * mm

# Two side-by-side tables
half = (CONTENT_W - 3 * mm) / 2
section_header(c, MARGIN, y, half, "Revenue Centers")
section_header(c, MARGIN + half + 3 * mm, y, half, "Tenders")
y -= 8 * mm
rev_rows = [
    ["Food", "0.00", "1,020.00", "1,020.00"],
    ["Beverages", "0.00", "337.00", "337.00"],
    ["Wine", "0.00", "0.00", "0.00"],
    ["Total", "0.00", "1,357.00", "1,357.00"],
]
tender_rows = [
    ["Qlub", "586.04"],
    ["Visa", "825.00"],
    ["Cash", "0.00"],
    ["Total", "1,411.04"],
]
rev_bottom = table(c, MARGIN, y, [28*mm, 20*mm, 20*mm, half-68*mm], ["Category", "Lunch", "Dinner", "Total"], rev_rows, aligns=["left", "right", "right", "right"])
table(c, MARGIN + half + 3 * mm, y, [half-28*mm, 28*mm], ["Tender", "Amount"], tender_rows, aligns=["left", "right"])
y = rev_bottom - 5 * mm

section_header(c, MARGIN, y, CONTENT_W, "Waiter Sales")
y -= 8 * mm
waiter_rows = [
    ["Haitam Elghazali", "1,357.00", "100.0%", "6", "226.17", "54.04"],
    ["Total", "1,357.00", "100%", "6", "226.17", "54.04"],
]
y = table(c, MARGIN, y, [47*mm, 30*mm, 22*mm, 20*mm, 30*mm, CONTENT_W-149*mm], ["Waiter", "Sales", "%", "Covers", "ASPH", "Gratuity"], waiter_rows, aligns=["left", "right", "right", "right", "right", "right"]) - 5 * mm

# Verification and comments
verify_w = 60 * mm
section_header(c, MARGIN, y, verify_w, "Values Verification")
section_header(c, MARGIN + verify_w + 3 * mm, y, CONTENT_W - verify_w - 3 * mm, "Daily Comments")
y -= 8 * mm
rounded_box(c, MARGIN, y - 29 * mm, verify_w, 29 * mm, PALE, 0)
text(c, "BALANCED", MARGIN + 3 * mm, y - 6 * mm, 7.5, True)
text(c, "Total Revenue", MARGIN + 3 * mm, y - 13 * mm, 6)
text(c, "1,357.00", MARGIN + verify_w - 3 * mm, y - 13 * mm, 6, True, "right")
text(c, "Tenders - CC Gratuity", MARGIN + 3 * mm, y - 19 * mm, 6)
text(c, "1,357.00", MARGIN + verify_w - 3 * mm, y - 19 * mm, 6, True, "right")
text(c, "Waiter Sales", MARGIN + 3 * mm, y - 25 * mm, 6)
text(c, "1,357.00", MARGIN + verify_w - 3 * mm, y - 25 * mm, 6, True, "right")

comments_x = MARGIN + verify_w + 3 * mm
comments_w = CONTENT_W - verify_w - 3 * mm
rounded_box(c, comments_x, y - 29 * mm, comments_w, 29 * mm, WHITE, 0)
text(c, "86's - Lunch", comments_x + 3 * mm, y - 6 * mm, 5.8, True)
text(c, "No unavailable items reported.", comments_x + 3 * mm, y - 12 * mm, 6)
text(c, "Service Comments - Dinner", comments_x + 3 * mm, y - 19 * mm, 5.8, True)
text(c, "Smooth service. Peak period handled without delays.", comments_x + 3 * mm, y - 25 * mm, 6)
y -= 35 * mm

section_header(c, MARGIN, y, CONTENT_W, "Discounts & Complementaries - Detail")
y -= 8 * mm
table(c, MARGIN, y, [35*mm, 42*mm, 30*mm, CONTENT_W-107*mm], ["Type", "Reason", "Amount", "Comment"], [["Manager comp", "Guest recovery", "75.00", "Approved by duty manager"], ["Total", "", "75.00", ""]], aligns=["left", "left", "right", "left"])

footer_y = MARGIN + 2 * mm
c.setStrokeColor(BORDER)
c.line(MARGIN, footer_y + 6 * mm, PAGE_W - MARGIN, footer_y + 6 * mm)
text(c, "File created on: 27/09/26 - 20:20 - Generated by David da Silva | INTERNAL CONFIDENTIAL DOCUMENT | All rights reserved", PAGE_W / 2, footer_y, 5.2, True, "center", DARK)

c.showPage()
c.save()
print(OUT.resolve())
