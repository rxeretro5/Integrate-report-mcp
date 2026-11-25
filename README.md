# MCP Server สำหรับถามข้อมูลในหน้ารายงาน

## ใช้กับโปรเจกต์ใหม่ผ่าน Codex Skill

เมื่อเผยแพร่ ให้ใช้โฟลเดอร์ที่มี README นี้เป็นรากของ GitHub repository โดยมี `server.js` และ `skills/` อยู่ที่ระดับแรก ฐานข้อมูลตัวอย่างสร้างใหม่ได้จาก `demo/create.js`

หลัง clone จาก GitHub ให้เปิด PowerShell ที่ราก repository แล้วติดตั้ง Skill สำหรับใช้ข้ามโปรเจกต์ด้วยคำสั่งต่อไปนี้ (สำหรับการติดตั้งครั้งแรก)

```powershell
$origin = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/|git@github\.com:)[\w.-]+/[\w.-]+/?$') { throw 'กรุณากำหนด GitHub origin แบบไม่มี token ก่อน' }
$codexDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$skillDir = Join-Path $codexDir 'skills/integrate-report-mcp'
New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
Copy-Item -LiteralPath './skills/integrate-report-mcp/SKILL.md' -Destination $skillDir
Set-Content -LiteralPath (Join-Path $skillDir 'repository.url') -Value $origin -Encoding ascii
```

เปิดแชต Codex ในโปรเจกต์ปลายทาง แล้วสั่ง เช่น “ใช้ $integrate-report-mcp สร้างโปรแกรมคลังสินค้าบน Windows ให้ถามยอดคงเหลือในหน้ารายงานเป็นภาษาไทยได้” Skill จะใช้ GitHub URL ที่บันทึกไว้ ดึงซอร์ส จด commit ที่ใช้ เชื่อมหน้ารายงาน และทดสอบผ่านตัวโปรแกรม หากติดตั้ง Skill ก่อนมี repository.url ให้ระบุ URL ในคำสั่งครั้งแรก

Windows App เรียก Server ผ่าน MCP บน stdio หนึ่งโปรเซสต่อผู้ใช้และฐานข้อมูลที่ผู้ใช้นั้นมีสิทธิ์อ่าน รุ่นแรกมีตัวเชื่อม SQLite และโปรแกรมคอนโซลสำหรับลองบทสนทนา ข้อมูลในตัวอย่างเป็นข้อมูลสมมุติทั้งหมด

## เริ่มใช้ใน PowerShell

ใช้ Node.js 24.14 ขึ้นไป เปิด PowerShell ในโฟลเดอร์โครงการ รุ่นนี้ใช้ไลบรารีที่มากับ Node ทั้งหมด

```powershell
if (-not (Test-Path settings.json)) { Copy-Item settings.example.json settings.json }
node demo/create.js
node client.js
```

พิมพ์ `/sample` เพื่อทดลองค้น SQLite ทันที ผลตัวอย่างคือ 1 คนในตำบลสาธิตที่อายุอย่างน้อย 60 ปี และมีผลครั้งล่าสุดเกิน 139 และ 89 ทั้งคู่ ตัวเลขนี้ใช้สาธิตการกรองข้อมูล หากเปลี่ยนเป็นเคยเข้าเกณฑ์อย่างน้อยหนึ่งครั้ง จะพบ 2 คน

หากต้องการใช้ภาษาธรรมชาติ ให้ใส่รหัสโมเดล OpenRouter ในช่อง `model` ของ `settings.json` และใส่คีย์ใน `apiKey` หรือส่งผ่านตัวแปรแวดล้อม `OPENROUTER_API_KEY` จากแอปแม่ ตัวแปร `OPENROUTER_MODEL` ใช้แทนช่อง model ได้ เปิดคอนโซลใหม่หลังแก้ Settings ไฟล์ settings.json เก็บคีย์เป็นข้อความบนเครื่องและอยู่ใน .gitignore

ลองถาม “ช่วยนับผู้สูงอายุในตำบลสาธิตที่ความดันสูง” และตอบคำถามต่อด้วยเกณฑ์ที่ต้องการ หรือถาม “How many people aged 60 or older live in สาธิต?” ใช้ `/new` เพื่อเริ่มหัวข้อใหม่ และ `/exit` เพื่อปิด คำสั่ง `node --test` ทดสอบระบบด้วยคำตอบโมเดลจำลอง

## เชื่อม Windows App

ให้ MCP Client เปิดโปรเซสโดยใช้ command เป็นพาธของ node.exe และ args เป็นรายการที่มีพาธเต็มของ server.js หนึ่งรายการ (ไม่ต้องใส่อัญประกาศซ้อนในค่า args) Server อ่าน settings.json ที่อยู่ข้าง server.js หรือตำแหน่งที่ระบุด้วย `REPORT_SETTINGS` พาธของ adapter, catalog และ database อ้างอิงจากโฟลเดอร์ของไฟล์ Settings

หลัง initialize ด้วย MCP รุ่น 2025-11-25 และส่ง notifications/initialized แล้ว แอปค้นรายการเครื่องมือผ่าน tools/list และเรียกผ่าน tools/call ตัวอย่างไคลเอนต์อยู่ใน client.js

| เครื่องมือ | ข้อมูลเข้า | ผลลัพธ์ |
|---|---|---|
| report_catalog | {} | คู่มือ รหัสรายงาน และตัวกรองที่รองรับ |
| report_ask | message และ sessionId เมื่อถามต่อ | sessionId พร้อม question, explanation หรือ report/filters/rows |
| report_run | report และ filters ตาม catalog | ผลจากฐานข้อมูลพร้อมเงื่อนไขที่ใช้ ใช้ได้โดยไม่ต้องมี API key |

ไคลเอนต์อ่าน structuredContent เมื่อสำเร็จ และแสดง content[0].text เมื่อ isError เป็นจริง เก็บ sessionId แยกตามรายงานและผู้ใช้ บริบทเก็บในหน่วยความจำ 10 รอบล่าสุด สูงสุด 100 บทสนทนาต่อโปรเซส เมื่อปิดโปรเซสให้เริ่ม session ใหม่

## เพิ่มฐานข้อมูลและโปรแกรม

สำหรับ SQLite ให้เตรียม catalog โดยอิง demo/catalog.json ใส่คู่มือใน manual และเพิ่มนิยามรายงานใน reports แต่ละรายการมี id, description, parameters และคำสั่ง SELECT ที่ผู้พัฒนาเขียน ผูกตัวกรองกับ named parameters เช่น :subdistrict รองรับชนิด string, number, boolean ในตัวตรวจกลาง (สำหรับ SQLite ให้ใช้ string หรือ number) และตัวเลือก enum ตัวกรองทุกตัวในรายงานเป็นค่าบังคับ ใช้รายงานแยกเมื่อมีเงื่อนไขคนละชุด แล้วชี้ database และ catalog ใน Settings ไปยังไฟล์จริง

สำหรับฐาน SQL ชนิดอื่นหรือ API ให้เขียนโมดูล JavaScript ที่ export ฟังก์ชัน open(settings, directory) คืนค่าออบเจ็กต์ที่มี manual, reports, run(reportId, filters) และ close() ตามตัวอย่าง adapters/sqlite.js ค่า reports เปิดเผยเฉพาะรหัส คำอธิบาย และ schema ตัวกรอง ส่วน run คืนรายการแถวที่ผู้ใช้มีสิทธิ์อ่าน ฟังก์ชัน open และ run รองรับ Promise ให้แต่ละแอปเลือก Adapter ผ่าน Settings ของตัวเอง

Server ส่งคู่มือ นิยามรายงาน ข้อความที่ผู้ใช้พิมพ์ และบริบทคำถามก่อนหน้าไปยัง OpenRouter ควรเขียนคู่มือโดยใช้ชื่อฟิลด์และตัวอย่างสมมุติ แถวผลลัพธ์จากฐานข้อมูลถูกส่งตรงให้ MCP Client ให้แอปแม่แสดงผลในเครื่อง และเลือกฐานข้อมูลหรือ Adapter ที่จำกัดข้อมูลตามสิทธิ์ของผู้ใช้ โดยเฉพาะเมื่อต้องใช้กับข้อมูลสุขภาพจริง
