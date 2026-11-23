Spectral Lab Mini V5 — 5 RAW RGB fresh display updates after settling 5 seconds

1. แตก ZIP ลงโฟลเดอร์ใหม่ ไม่ทับไฟล์ V3/V4 หรือฐานข้อมูลเดิม
2. บน Windows ให้ดับเบิลคลิก START_MINI_WINDOWS.bat (ต้องติดตั้ง Python) ใช้ Chrome
3. นำเข้า Gaussian Database JSON จากหลังบ้าน เว้นแต่ Chrome มีฐานข้อมูลที่โหลดได้แล้ว
4. กดปุ่มเปิดเว็บเซนเซอร์จากหน้าบ้านใหม่เท่านั้น เชื่อม BLE ในเว็บ CM-34725 และตรวจ Raw Counts R/G/B
5. ตั้ง Gain, Integration, Averaging, LED ด้วยเว็บเซนเซอร์เดิมตามวิธีทดลอง; หน้าบ้านไม่ได้ตั้งอุปกรณ์เหล่านี้อัตโนมัติ
6. กดคัดลอก Bridge Code ใหม่ V5; บนเว็บเซนเซอร์เปิด Chrome DevTools > Console แล้ววางโค้ดที่ตรวจสอบแล้ว กด Enter
7. ดู Live Raw RGB ในหน้าบ้าน กด Analyze รอ 5 วินาที แล้วระบบจะรวบรวม 5 ชุดใหม่ (ประมาณ 5 วินาทีอีกช่วงหนึ่ง ถ้า stream เป็น 1 Hz)
8. แสดง Mean R/G/B และ SD แบบ sample SD (n-1) แล้วใช้ค่า Mean เต็มคำนวณ Gaussian ไม่ปัดและไม่จำกัด 255

ข้อจำกัดวิทยาศาสตร์: Bridge อ่านจากตัวเลข RAW COUNTS บนหน้า CM-34725 โดยตรวจ DOM update + sequence เฉพาะของ Bridge; หมายเลข update ไม่ใช่หมายเลขเฟรมจากเฟิร์มแวร์ และไม่สามารถพิสูจน์ตัวตนของ frame จริง 100% หากไม่มี timestamp/sequence จากเฟิร์มแวร์โดยตรง. หากไม่มีหลักฐานข้อมูลใหม่ครบ 5 ชุดภายใน 18 วินาที ระบบจะแจ้งเตือนและไม่สร้างผลทำนาย.
ไม่ใช้ DEMO เป็นข้อมูลจริง. ห้ามวางโค้ดไม่ทราบแหล่งที่มาใน Console.

แนะนำใช้ FRONTEND_RGB_MINI_V5.html; ไฟล์ BRIDGE_V3_FIVE_FRAMES.html เป็นทางเลือกเต็มหน้าจอสำหรับเทียบฟังก์ชันเดิม.
