import PDFDocument from 'pdfkit';

/**
 * Generate a PDF buffer for a B'Smart order
 * @param {Object} order - Complete order object with customer, items, delivery details
 * @returns {Promise<Buffer>}
 */
export function generateOrderPdf(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
          Title: `B'Smart Order Receipt - ${order.orderNumber || order.id}`,
          Author: "B'Smart Dresses Bathinda",
          Subject: 'School Uniform Order & Delivery Credentials',
        }
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Brand Colors
      const primaryMaroon = '#881337';
      const secondaryMaroon = '#7F1D1D';
      const accentGold = '#D97706';
      const darkText = '#1F2937';
      const grayText = '#4B5563';
      const lightBg = '#F9FAFB';
      const tableBorder = '#E5E7EB';

      // 1. Top Decorative Brand Bar
      doc.rect(0, 0, doc.page.width, 10).fill(primaryMaroon);
      doc.rect(0, 10, doc.page.width, 4).fill('#FACC15');

      // 2. Header Section
      let y = 35;
      
      // Store Title
      doc.fillColor(primaryMaroon)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text("B'SMART DRESSES", 40, y);
      
      doc.fillColor(accentGold)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text("PREMIUM QUALITY SCHOOL UNIFORMS & ACCESSORIES", 40, y + 26);
      
      doc.fillColor(grayText)
        .font('Helvetica')
        .fontSize(8)
        .text("GSTIN: 03ANXPG2252L1ZS  |  Ph: +91 98883-88170", 40, y + 38)
        .text("#MCB-Z304654, Dr. Mela Ram Hospital Road, Amrik Singh Road, Bathinda (PB)", 40, y + 49);

      // Order Receipt Badge on Top Right
      doc.rect(doc.page.width - 210, y - 5, 170, 65)
        .fillAndStroke(lightBg, tableBorder);
      
      doc.fillColor(primaryMaroon)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text("ORDER RECEIPT", doc.page.width - 200, y + 2);
      
      doc.fillColor(darkText)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(`Order No: ${order.orderNumber || order.id}`, doc.page.width - 200, y + 18)
        .font('Helvetica')
        .fontSize(8)
        .text(`Date: ${new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, doc.page.width - 200, y + 32);

      const statusUpper = (order.status || 'PENDING').toUpperCase();
      let statusBg = '#FEF3C7';
      let statusTextColor = '#92400E';
      if (statusUpper === 'ACCEPTED') {
        statusBg = '#DBEAFE';
        statusTextColor = '#1E40AF';
      } else if (statusUpper === 'COMPLETED') {
        statusBg = '#D1FAE5';
        statusTextColor = '#065F46';
      } else if (statusUpper === 'DECLINED') {
        statusBg = '#FEE2E2';
        statusTextColor = '#991B1B';
      }

      doc.rect(doc.page.width - 200, y + 46, 75, 12).fill(statusBg);
      doc.fillColor(statusTextColor)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(`STATUS: ${statusUpper}`, doc.page.width - 196, y + 48.5);

      y += 80;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor(tableBorder).stroke();

      // 3. Customer & Delivery Info Card
      y += 12;
      const cardWidth = (doc.page.width - 90) / 2;

      // Customer Info Block
      doc.rect(40, y, cardWidth, 85).fillAndStroke('#FFFDF5', tableBorder);
      doc.fillColor(secondaryMaroon).font('Helvetica-Bold').fontSize(10).text("CUSTOMER DETAILS", 50, y + 8);
      
      doc.fillColor(darkText).font('Helvetica-Bold').fontSize(9).text(order.customerName || 'Customer', 50, y + 24);
      doc.font('Helvetica').fontSize(8.5).fillColor(grayText)
        .text(`Mobile: ${order.customerMobile || 'N/A'}`, 50, y + 38)
        .text(`School: ${order.school || 'General School'}`, 50, y + 50);

      // Delivery Destination Block
      const rightCardX = 40 + cardWidth + 10;
      doc.rect(rightCardX, y, cardWidth, 85).fillAndStroke('#F0FDF4', tableBorder);
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(10).text("DELIVERY DETAILS", rightCardX + 10, y + 8);

      const addr = typeof order.deliveryAddress === 'object' && order.deliveryAddress !== null
        ? `${order.deliveryAddress.address1 || ''} ${order.deliveryAddress.address2 || ''}, ${order.deliveryAddress.city || ''} ${order.deliveryAddress.state || ''} - ${order.deliveryAddress.postal || ''}`
        : (order.deliveryAddress || 'Standard Delivery Address');

      doc.fillColor(darkText).font('Helvetica').fontSize(8.5)
        .text(addr, rightCardX + 10, y + 24, { width: cardWidth - 20, height: 35 });

      if (order.deliveryTime) {
        doc.fillColor('#1E40AF').font('Helvetica-Bold').fontSize(8.5)
          .text(`Scheduled Delivery: ${order.deliveryTime}`, rightCardX + 10, y + 62);
      } else {
        doc.fillColor(grayText).font('Helvetica-Bold').fontSize(8.5)
          .text("Scheduled Delivery: Estimated upon Admin Acceptance", rightCardX + 10, y + 62);
      }

      y += 100;

      // 4. Products Table
      doc.fillColor(secondaryMaroon).font('Helvetica-Bold').fontSize(11).text("ORDERED ITEMS & SPECIFICATIONS", 40, y);
      y += 16;

      // Table Header Row
      doc.rect(40, y, doc.page.width - 80, 20).fill(primaryMaroon);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      doc.text("ITEM & CREDENTIALS", 48, y + 6);
      doc.text("SCHOOL / CLASS", 220, y + 6);
      doc.text("SIZE", 340, y + 6);
      doc.text("RATE (INR)", 400, y + 6, { width: 50, align: 'right' });
      doc.text("QTY", 460, y + 6, { width: 30, align: 'center' });
      doc.text("TOTAL (INR)", 500, y + 6, { width: 55, align: 'right' });

      y += 20;

      // Table Body Rows
      const items = Array.isArray(order.items) ? order.items : [];
      let subtotal = 0;

      items.forEach((item, index) => {
        const itemBg = index % 2 === 0 ? '#FFFFFF' : lightBg;
        const itemPrice = Number(item.price || item.basePrice || 0);
        const itemQty = Number(item.qty || item.quantity || 1);
        const itemTotal = itemPrice * itemQty;
        subtotal += itemTotal;

        doc.rect(40, y, doc.page.width - 80, 26).fillAndStroke(itemBg, tableBorder);

        doc.fillColor(darkText).font('Helvetica-Bold').fontSize(8.5)
          .text(item.name || 'Uniform Item', 48, y + 5, { width: 165, height: 12 });
        
        doc.fillColor(grayText).font('Helvetica').fontSize(7.5)
          .text(item.category || 'General Uniform', 48, y + 16, { width: 165 });

        doc.fillColor(darkText).font('Helvetica').fontSize(8)
          .text(item.school || order.school || 'Standard', 220, y + 8, { width: 115 });

        doc.fillColor(secondaryMaroon).font('Helvetica-Bold').fontSize(8.5)
          .text(`Size ${item.size || 'Standard'}`, 340, y + 8);

        doc.fillColor(darkText).font('Helvetica').fontSize(8.5)
          .text(`Rs. ${itemPrice.toFixed(2)}`, 400, y + 8, { width: 50, align: 'right' });

        doc.fillColor(darkText).font('Helvetica-Bold').fontSize(8.5)
          .text(String(itemQty), 460, y + 8, { width: 30, align: 'center' });

        doc.fillColor(secondaryMaroon).font('Helvetica-Bold').fontSize(8.5)
          .text(`Rs. ${itemTotal.toFixed(2)}`, 500, y + 8, { width: 55, align: 'right' });

        y += 26;
      });

      // 5. Calculation Summary Box
      y += 10;
      const summaryBoxX = doc.page.width - 240;
      const summaryBoxWidth = 200;

      doc.rect(summaryBoxX, y, summaryBoxWidth, 80).fillAndStroke(lightBg, tableBorder);

      const deliveryFee = order.deliveryFee !== undefined ? Number(order.deliveryFee) : (subtotal >= 500 ? 0 : 50);
      const grandTotal = Number(order.totalAmount || (subtotal + deliveryFee));

      doc.fillColor(grayText).font('Helvetica').fontSize(8.5)
        .text("Items Subtotal:", summaryBoxX + 12, y + 10)
        .text(`Rs. ${subtotal.toFixed(2)}`, summaryBoxX + 110, y + 10, { width: 78, align: 'right' });

      doc.text("Delivery Fee:", summaryBoxX + 12, y + 25)
        .text(deliveryFee === 0 ? "FREE (Rs.0)" : `Rs. ${deliveryFee.toFixed(2)}`, summaryBoxX + 110, y + 25, { width: 78, align: 'right' });

      doc.moveTo(summaryBoxX + 10, y + 42).lineTo(summaryBoxX + summaryBoxWidth - 10, y + 42).strokeColor(tableBorder).stroke();

      doc.fillColor(primaryMaroon).font('Helvetica-Bold').fontSize(11)
        .text("Grand Total:", summaryBoxX + 12, y + 52)
        .text(`Rs. ${grandTotal.toFixed(2)}`, summaryBoxX + 100, y + 52, { width: 88, align: 'right' });

      // Delivery Status Notice
      doc.rect(40, y, summaryBoxX - 55, 80).fillAndStroke('#FEFCE8', '#FDE047');
      doc.fillColor('#854D0E').font('Helvetica-Bold').fontSize(9)
        .text("DELIVERY & FULFILLMENT STATUS", 50, y + 10);
      
      const isCompleted = Boolean(order.userCompleted || order.status === 'completed');
      doc.fillColor(darkText).font('Helvetica').fontSize(8)
        .text(`Order Status: ${order.status?.toUpperCase() || 'PENDING'}`, 50, y + 25)
        .text(`Estimated Reach Time: ${order.deliveryTime || 'To be communicated upon confirmation'}`, 50, y + 38)
        .text(`Customer Handover Confirmed: ${isCompleted ? 'YES (Verified Received)' : 'Awaiting Delivery Handover'}`, 50, y + 51)
        .text(`Payment Mode: Cash / UPI on Delivery (COD)`, 50, y + 64);

      y += 100;

      // 6. Terms & Conditions & Footer
      doc.rect(40, y, doc.page.width - 80, 75).fillAndStroke(lightBg, tableBorder);
      doc.fillColor(grayText).font('Helvetica-Bold').fontSize(7.5)
        .text("TERMS & CONDITIONS:", 48, y + 6);
      doc.font('Helvetica').fontSize(7).fillColor(grayText)
        .text("1. Any return or exchange of the product can be done within 7 days of purchase at our store.", 48, y + 17)
        .text("2. Original receipt or invoice is required.", 48, y + 27)
        .text("3. Clothes should be unworn, unwashed and with all original tags unbroken should be there in same condition.", 48, y + 37)
        .text("4. No Guarantee No Claim on any product.", 48, y + 47)
        .text("5. Subject to Bathinda Jurisdiction only.", 48, y + 57);

      // Bottom Bar
      doc.rect(0, doc.page.height - 15, doc.page.width, 15).fill(primaryMaroon);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
        .text("B'SMART DRESSES BATHINDA  •  OFFICIAL ORDER DOCUMENTATION", 0, doc.page.height - 11, { align: 'center', width: doc.page.width });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
