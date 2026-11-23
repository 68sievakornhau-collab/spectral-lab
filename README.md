# Spectral Lab Online

เว็บสำหรับเชื่อมเซนเซอร์และสร้าง RGB-Predicted Absorption Spectrum จากโมเดล Gaussian ที่ส่งออกจาก Spectral Lab เดิม ซอร์สเว็บอยู่ที่ `docs/` และไฟล์เดิมสำรองไว้ใน `SpectralLab-original-backup.zip`

## เปิดใน Windows และ Chrome

1. เปิด Terminal ใน VS Code ที่โฟลเดอร์โปรเจกต์
2. รัน `py -3 -m http.server 8765 --bind 127.0.0.1 --directory docs` หาก Windows ไม่มีคำสั่ง `py` ให้ใช้ `python -m http.server 8765 --bind 127.0.0.1 --directory docs` เมื่อมี Python ติดตั้งแล้ว
3. เปิด `http://localhost:8765/` ใน Chrome เปิด Bluetooth แล้วกด **Connect Bluetooth** เลือกอุปกรณ์ RGBMeter จากรายการ กด **Continue to Analysis** เมื่อเว็บได้รับแพ็กเก็ตข้อมูลที่อ่านได้
4. เลือก Snapshot และสาร แล้วกด **Simulate Spectrum** เว็บเก็บแพ็กเก็ตใหม่ 3 วินาทีและต้องมีอย่างน้อย 2 แพ็กเก็ตสำหรับ Sample SD หากการเชื่อมต่อหลุด ให้กลับหน้า Sensor Connection และเชื่อมใหม่

## BLE และการยืนยันค่า

เว็บเชื่อม GATT จากหน้าเดียวโดยใช้ Nordic UART ตามเว็บ CM-34725 และ README ของอุปกรณ์ ใช้ UUID ส่วนต้น `6e400001` สำหรับ service, `6e400002` สำหรับเขียน, `6e400003` สำหรับ notify ต่อท้ายด้วย `-b5a3-f393-e0a9-e50e24dcca9e` ข้อมูลส่งเป็นบรรทัดข้อความ UTF-8 โดย `D,r,g,b,c,atime,gain,n` ให้ Raw Counts และจำนวนรอบที่ถูกรวมในแพ็กเก็ต `S,key=value,...` ให้สถานะอุปกรณ์ และ `E,...` แจ้งข้อผิดพลาด แพ็กเก็ต `D` ที่ระบุในซอร์สไม่มีเลขเฟรมของอุปกรณ์ ระบบจึงนับบรรทัดสมบูรณ์จาก BLE Notification และใช้เลขลำดับที่สร้างในเว็บป้องกันการนับรายการเดิมซ้ำในช่วงวัด ตัวเลข RGB ที่เท่ากันจากคนละบรรทัดยังนับได้ แพ็กเก็ตที่แบ่งหลาย Notification ต้องเริ่มและจบภายในช่วงวัด หากอุปกรณ์ส่งบรรทัดเดิมซ้ำจริง โปรโตคอลนี้แยกกรณีนั้นจากการวัดค่าเท่ากันไม่ได้

ค่าที่ขอคือ Gain 4×, ATIME 131 (300 ms), External LED ON, 100%, Rate 1000 ms และ Stream ON เว็บขอสถานะด้วย `STATE` และแสดง Verified เมื่อค่าที่อุปกรณ์รายงานตรงทั้งหมด การเลือก Average 8 ในเว็บอ้างอิงเป็นการเฉลี่ยฝั่งเว็บ เว็บนี้ใช้หลักเดียวกันกับตัวอย่างสีโดยเฉลี่ยสูงสุด 8 แพ็กเก็ตที่ตั้ง Gain/Integration ตรงกัน ส่วนการวัด 3 วินาทีใช้ทุกแพ็กเก็ตในหน้าต่างโดยตรงและรายงาน N ตามที่ได้รับจริง

Approximate Color Preview ใช้การหารด้วยค่าสูงสุดของช่องแล้วเข้ารหัส sRGB ตามแนวทางเมื่อไม่มีการสอบเทียบของเว็บเซนเซอร์ ค่าสี 0–255 ใช้แสดงผลเท่านั้น

[ซอร์สและคู่มือเว็บ CM-34725](https://github.com/kittipat-rot/ESP32-C3-supermini_TCS34725)

## ฐานข้อมูลจากหลังบ้าน

- `docs/simulation-databases.json` เป็นสำเนาไฟล์จริงแบบตรงทุกไบต์ มี 3 Snapshots ของ Methyl orange, Methylene blue และ Crystal violet
- เว็บเรียงตาม `createdAt` เลือกสูงสุด 3 ชุด และแสดงตัวเลือกสารของ Snapshot ที่เลือก นำเข้า JSON ใหม่ได้สำหรับเซสชันที่เปิดอยู่ หากต้องการเปลี่ยนค่าเริ่มต้นของเว็บไซต์ ให้แทนที่ไฟล์ JSON ด้วยไฟล์ Export ที่ตรวจแล้ว
- คีย์เก่าของหลังบ้านคือ `rgb_uvvis_simulation_database_snapshots_v1` เว็บใช้ไฟล์ส่งออกเป็นแหล่งข้อมูล จึงใช้ได้เมื่อ origin ของหลังบ้านต่างจากเว็บ
- JSON เดิมไม่มี metadata ชนิด RGB และค่าฝึกต่ำกว่า 1 จึงดูสถิติ Raw Counts ได้ แต่ระบบหยุดก่อนทำนาย สำหรับโมเดลที่ยืนยันจากบันทึกต้นทางว่าฝึกด้วย Raw Counts ให้ระบุ `rgbInputType: "raw-counts"` ที่รายการสารใน JSON ที่ตรวจยืนยันแล้ว ชุดฝึกชนิดอื่นต้องมีวิธีวัดและแปลงอินพุตที่ยืนยันได้ก่อนรองรับ
- การทำนายอ่าน `coef`, `means`, `scales` หรือ `mean` ค่าเต็ม โมเดลเก่าที่เหลือเพียงสมการแสดงผลต้องส่งออกสัมประสิทธิ์เต็มก่อนใช้งาน กราฟใช้ Baseline ที่บันทึกในโมเดลและแจ้งข้อผิดพลาดถ้าพารามิเตอร์ peak ผิดเงื่อนไข

## เผยแพร่ด้วย GitHub Pages

นำโฟลเดอร์ `docs/` เข้า branch ที่ต้องการเผยแพร่ ใน repository ปลายทางไปที่ **Settings → Pages → Deploy from a branch** แล้วเลือก branch และ **/docs** เปิด **Enforce HTTPS** เมื่อ Pages พร้อม ใช้ URL ที่ GitHub แสดงในหน้า Pages และทดสอบ BLE บน URL จริง

ข้อมูล JSON ใน `docs/` ดาวน์โหลดได้จากเว็บ ผลการตรวจไฟล์ปัจจุบันพบชื่อสาร ระดับความเข้มข้น ID ตัวอย่าง เวลา และข้อมูลการฟิต ควรยืนยันว่าข้อมูลการทดลองเหล่านี้เผยแพร่ได้ก่อน push ไปยัง repo สาธารณะ เก็บไฟล์ ZIP สำรองไว้นอก commit ที่เผยแพร่

[ตั้งค่าแหล่งเผยแพร่ GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## ทดสอบ

`node --test tests/spectral.test.mjs`

`node tests/browser-smoke.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe"`

ชุดทดสอบ BLE ใช้แพ็กเก็ตและ GATT จำลองเฉพาะในการทดสอบ โฟลเดอร์เว็บไม่มีโหมดจำลอง ยืนยันการเชื่อมต่ออุปกรณ์จริงและการทำงานผ่าน HTTPS หลังมีฮาร์ดแวร์และ URL สำหรับทดสอบ