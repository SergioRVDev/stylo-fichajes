import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface EmployeeReportLight {
  email: string;
  displayName: string;
  totalWorkMs: number;
  totalBreakMs: number;
  days: Record<string, any>;
  signatures: { url: string; timestamp: number }[];
}

export async function generateReportPDF(
  companyName: string,
  dateRange: { from: string; to: string },
  reportData: EmployeeReportLight[]
): Promise<Blob> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dur = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  for (let index = 0; index < reportData.length; index++) {
    const emp = reportData[index];
    if (!emp) continue;

    if (index > 0) doc.addPage();

    // --- HEADER ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("REGISTRO OFICIAL DE JORNADA LABORAL", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("(Artículo 34.9 del Estatuto de los Trabajadores)", pageWidth / 2, 25, { align: "center" });

    // --- COMPANY INFO ---
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 32, pageWidth - 28, 20, 2, 2, "FD");
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DE LA EMPRESA", 18, 38);
    doc.setFont("helvetica", "normal");
    doc.text(`Razón Social: ${companyName}`, 18, 44);
    doc.text("CIF: E88553383", 18, 49);

    // --- EMPLOYEE INFO ---
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 56, pageWidth - 28, 20, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DEL TRABAJADOR", 18, 62);
    doc.setFont("helvetica", "normal");
    doc.text(`Nombre: ${emp.displayName.toUpperCase()}`, 18, 68);
    doc.text(`Identificación / Email: ${emp.email}`, 18, 73);

    // --- PERIOD ---
    doc.setFont("helvetica", "bold");
    doc.text(`Período Auditado: ${new Date(dateRange.from).toLocaleDateString("es-ES")} al ${new Date(dateRange.to).toLocaleDateString("es-ES")}`, 14, 85);

    let startY = 90;

    const includeSignatures = reportData.length === 1;

    // --- TABLE DATA ---
    const tableData: any[] = [];
    
    Object.keys(emp.days).sort().forEach(date => {
      const summary = emp.days[date];
      const dateStr = new Date(date + "T00:00:00").toLocaleDateString("es-ES", { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      const workStrs = summary.work.map((s: any) => `${fmt(s.start)} - ${s.end ? fmt(s.end) : "En curso"}`).join("\n");
      const breakStrs = summary.breaks?.map((s: any) => `${fmt(s.start)} - ${s.end ? fmt(s.end) : "En curso"}`).join("\n") || "";
      
      const row = [
        dateStr,
        workStrs || "Sin fichar",
        breakStrs || "-",
        dur(summary.workMs),
        summary.breakMs > 0 ? dur(summary.breakMs) : "-"
      ];
      if (includeSignatures) row.push("");
      tableData.push(row);
    });

    if (tableData.length === 0) {
       tableData.push([{ content: 'Sin registros en este periodo', colSpan: includeSignatures ? 6 : 5, styles: { halign: 'center', fontStyle: 'italic' } }]);
    } else {
      // Add a final row for Totals
      const totalRow = [
        "TOTAL PERÍODO",
        "",
        "",
        dur(emp.totalWorkMs),
        dur(emp.totalBreakMs)
      ];
      if (includeSignatures) totalRow.push("");
      tableData.push(totalRow);
    }

    const headRow = includeSignatures 
      ? [["Fecha", "Jornadas (Entrada - Salida)", "Pausas", "T. Efectivo", "T. Pausa", "Firma Trabajador"]]
      : [["Fecha", "Jornadas (Entrada - Salida)", "Pausas", "T. Efectivo", "T. Pausa"]];

    const columnStyles = includeSignatures 
      ? {
          0: { cellWidth: 22, halign: "center" },
          1: { cellWidth: 42 },
          2: { cellWidth: 32 },
          3: { cellWidth: 20, halign: 'right', fontStyle: "bold" },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 42 } // Blank column
        }
      : {
          0: { cellWidth: 25, halign: "center" },
          1: { cellWidth: 55 },
          2: { cellWidth: 45 },
          3: { cellWidth: 25, halign: 'right', fontStyle: "bold" },
          4: { cellWidth: 28, halign: 'right' }
        };

    autoTable(doc, {
      startY: startY,
      head: headRow,
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", halign: "center" },
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      columnStyles: columnStyles as any,
      didParseCell: function(data) {
        if (data.row.index === tableData.length - 1 && data.section === 'body' && tableData.length > 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 15;

    // --- SIGNATURE BLOCK ---
    if (includeSignatures) {
      if (finalY + 90 > pageHeight) { // Add more space allowance for image signatures
        doc.addPage();
        finalY = 20;
      }

      // Legal declaration
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100);
      const declarationText = "Declaro que los datos aquí reflejados son ciertos y corresponden a las horas de trabajo efectivas realizadas en el periodo indicado, sirviendo como registro oficial según establece el Art. 34.9 de la Ley del Estatuto de los Trabajadores.";
      const splittedText = doc.splitTextToSize(declarationText, pageWidth - 28);
      doc.text(splittedText, 14, finalY);

      finalY += (splittedText.length * 4) + 12;

      // Digital Signatures Logic (Firebase Images)
      if (emp.signatures && emp.signatures.length > 0) {
        let sigX = 14;
        for (const sig of emp.signatures) {
           if (sigX > 150) {
             finalY += 30;
             sigX = 14;
           }
           
           try {
             // ... [Signature image loading logic omitted for brevity, keeping existing implementation]
             const res = await fetch(sig.url, { mode: 'cors' });
             if (res.ok) {
               const blob = await res.blob();
               const dataUrl = await new Promise<string>((resolve) => {
                 const reader = new FileReader();
                 reader.onloadend = () => resolve(reader.result as string);
                 reader.readAsDataURL(blob);
               });
               doc.addImage(dataUrl, "PNG", sigX, finalY, 30, 15);
             }
           } catch (e) {
             console.warn("Failed to load signature image", e);
           }
           
           doc.setFontSize(7);
           doc.setFont("helvetica", "normal");
           doc.setTextColor(50);
           doc.text(`FIRMADO Electrónico: ${new Date(sig.timestamp).toLocaleDateString("es-ES")} ${new Date(sig.timestamp).toLocaleTimeString("es-ES", {hour: '2-digit', minute:'2-digit'})}`, sigX, finalY + 20);
           sigX += 50;
        }
        finalY += 25;
      }
      
      // Physical Signatures Fallback/Complement
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);

      const signY = finalY + 15;
      
      // Emp box
      doc.text("Por la EMPRESA", 45, finalY, { align: "center" });
      doc.line(20, signY, 70, signY); 
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("Firma y sello", 45, signY + 4, { align: "center" });

      // Worker box
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("EL TRABAJADOR", pageWidth - 45, finalY, { align: "center" });
      doc.line(pageWidth - 70, signY, pageWidth - 20, signY);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("Firma o conformidad electrónica", pageWidth - 45, signY + 4, { align: "center" });
    }

    // --- AUDIT METADATA FOOTER ---
    const pageFooterY = pageHeight - 10;
    doc.setFontSize(7);
    doc.setTextColor(150);
    const timestamp = new Date().toLocaleString("es-ES");
    // Unlike inspector, reports might not have a verification code immediately at generation but we log generic audit text
    doc.text(`Documento generado digitalmente. Panel de Empresa. | Fecha emisión: ${timestamp}`, 14, pageFooterY);
    doc.setTextColor(0); 
  }

  return doc.output("blob");
}
