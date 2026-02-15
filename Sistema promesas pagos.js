// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA DE PROMESAS DE PAGO Y CALENDARIO DE COBRANZA
// Por: Claude para LeGaXi Asociados
// Funcionalidades:
// - Registrar promesas de pago con fecha y monto
// - Dashboard "Quien paga HOY"
// - Calendario semanal y mensual
// - Estimados de cobranza por día
// - Alertas de promesas vencidas
// - Contactar masivamente a quienes prometen hoy
// ═══════════════════════════════════════════════════════════════════════════

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. VARIABLES GLOBALES Y ESTRUCTURA DE DATOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// La variable 'promesas' ya está definida en el código principal como:
// let promesas = JSON.parse(localStorage.getItem('promesasPago') || '{}');

// Estructura de promesas:
// promesas = {
//     "5215551234": [  // Teléfono del cliente
//         {
//             fecha: "2026-02-14",  // ISO format
//             monto: 500,
//             nota: "Dice que le pagan el viernes",
//             registrada: "2026-02-10T10:30:00",
//             estado: "pendiente", // "pendiente", "cumplida", "incumplida"
//             cobrador: "Juan Perez"
//         }
//     ]
// }

let currentPromesaClient = null;
let pagosHoyCache = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. FUNCIONES DE PROMESAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openPromesa(phone, name, saldo) {
    currentPromesaClient = { phone, name, saldo };
    document.getElementById('promesaClientName').textContent = name;
    document.getElementById('promesaClientDebt').textContent = '$' + fmt(saldo);
    
    // Fecha mínima es hoy
    document.getElementById('promesaFecha').min = new Date().toISOString().split('T')[0];
    document.getElementById('promesaFecha').value = '';
    document.getElementById('promesaMonto').value = '';
    document.getElementById('promesaNota').value = '';
    
    document.getElementById('promesaModal').classList.add('active');
}

function closePromesa() {
    document.getElementById('promesaModal').classList.remove('active');
    currentPromesaClient = null;
}

function guardarPromesa() {
    if (!currentPromesaClient) return;
    
    const fecha = document.getElementById('promesaFecha').value;
    const monto = parseFloat(document.getElementById('promesaMonto').value);
    const nota = document.getElementById('promesaNota').value.trim();
    
    if (!fecha) {
        showToast('❌ Selecciona una fecha');
        return;
    }
    
    if (!monto || monto <= 0) {
        showToast('❌ Ingresa un monto válido');
        return;
    }
    
    if (monto > currentPromesaClient.saldo) {
        if (!confirm(`El monto ($${fmt(monto)}) excede el saldo ($${fmt(currentPromesaClient.saldo)}). ¿Continuar?`)) {
            return;
        }
    }
    
    const phone = currentPromesaClient.phone;
    
    // Inicializar array si no existe
    if (!promesas[phone]) {
        promesas[phone] = [];
    }
    
    // Crear promesa
    const promesa = {
        fecha: fecha,
        monto: monto,
        nota: nota,
        registrada: new Date().toISOString(),
        estado: 'pendiente',
        cobrador: lastCapturista || 'Sistema'
    };
    
    promesas[phone].push(promesa);
    
    // Guardar en localStorage
    localStorage.setItem('promesasPago', JSON.stringify(promesas));
    
    // Sincronizar con nube si es posible
    syncToCloud('registrarPromesa', {
        telefono: phone,
        cliente: currentPromesaClient.name,
        promesa: promesa
    });
    
    showToast(`✅ Promesa registrada: $${fmt(monto)} el ${formatDateShort(fecha)}`);
    closePromesa();
    
    // Actualizar badge si la promesa es para hoy
    actualizarBadgePagosHoy();
}

function getPromesasCliente(phone) {
    return promesas[phone] || [];
}

function marcarPromesaCumplida(phone, index) {
    if (promesas[phone] && promesas[phone][index]) {
        promesas[phone][index].estado = 'cumplida';
        promesas[phone][index].fechaCumplida = new Date().toISOString();
        localStorage.setItem('promesasPago', JSON.stringify(promesas));
        
        syncToCloud('actualizarPromesa', {
            telefono: phone,
            indice: index,
            estado: 'cumplida'
        });
    }
}

function marcarPromesaIncumplida(phone, index) {
    if (promesas[phone] && promesas[phone][index]) {
        promesas[phone][index].estado = 'incumplida';
        promesas[phone][index].fechaIncumplida = new Date().toISOString();
        localStorage.setItem('promesasPago', JSON.stringify(promesas));
        
        syncToCloud('actualizarPromesa', {
            telefono: phone,
            indice: index,
            estado: 'incumplida'
        });
    }
}

function contarPromesasIncumplidas(phone) {
    if (!promesas[phone]) return 0;
    return promesas[phone].filter(p => p.estado === 'incumplida').length;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. DASHBOARD "PAGOS HOY"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showPagosHoy() {
    actualizarPagosHoy();
    document.getElementById('pagosHoyModal').classList.add('active');
}

function closePagosHoy() {
    document.getElementById('pagosHoyModal').classList.remove('active');
}

function switchPagosTab(tab) {
    // Actualizar tabs
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Actualizar paneles
    document.querySelectorAll('.admin-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    if (tab === 'hoy') {
        document.getElementById('panelPagosHoy').classList.add('active');
        actualizarPagosHoy();
    } else if (tab === 'semana') {
        document.getElementById('panelPagosSemana').classList.add('active');
        actualizarCalendarioSemana();
    } else if (tab === 'mes') {
        document.getElementById('panelPagosMes').classList.add('active');
        actualizarCalendarioMes();
    }
}

function actualizarPagosHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    const pagosHoy = getPagosPorFecha(hoy);
    
    pagosHoyCache = pagosHoy;
    
    // Actualizar resumen superior
    const totalEsperado = pagosHoy.reduce((sum, p) => sum + p.monto, 0);
    const numClientes = pagosHoy.length;
    const promedio = numClientes > 0 ? totalEsperado / numClientes : 0;
    
    document.getElementById('periodoActual').textContent = 'HOY';
    document.getElementById('montoEsperado').textContent = '$' + fmt(totalEsperado);
    document.getElementById('numClientesEsperados').textContent = numClientes;
    document.getElementById('promedioEsperado').textContent = '$' + fmt(promedio);
    
    // Generar lista
    const lista = document.getElementById('listaPagosHoy');
    
    if (pagosHoy.length === 0) {
        lista.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#999;">
                <i class="fas fa-calendar-check" style="font-size:3rem; margin-bottom:15px; opacity:0.3;"></i>
                <div style="font-size:1.1rem; margin-bottom:5px;">Sin pagos programados hoy</div>
                <div style="font-size:0.85rem;">Registra promesas de pago en las fichas de clientes</div>
            </div>
        `;
        return;
    }
    
    lista.innerHTML = pagosHoy.map((p, idx) => {
        const vencido = new Date() > new Date(p.fecha + 'T23:59:59');
        const promesasIncumplidas = contarPromesasIncumplidas(p.telefono);
        
        return `
            <div style="background:white; border-radius:10px; padding:12px; margin-bottom:8px; border-left:4px solid ${vencido ? '#e74c3c' : '#27AE60'};">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:0.95rem; margin-bottom:3px;">
                            ${p.nombre}
                            ${promesasIncumplidas > 0 ? `<span style="background:#e74c3c; color:white; padding:2px 6px; border-radius:8px; font-size:0.65rem; margin-left:5px;">⚠ ${promesasIncumplidas} incumplidas</span>` : ''}
                        </div>
                        <div style="font-size:0.75rem; color:#666;">
                            <i class="fas fa-phone"></i> ${fmtPhone(p.telefono)}
                        </div>
                        ${p.nota ? `<div style="font-size:0.75rem; color:#1F4E79; margin-top:4px;"><i class="fas fa-sticky-note"></i> ${p.nota}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.3rem; font-weight:700; color:#27AE60;">$${fmt(p.monto)}</div>
                        <div style="font-size:0.7rem; color:#999;">Saldo: $${fmt(p.saldo)}</div>
                    </div>
                </div>
                <div style="display:flex; gap:5px; margin-top:8px;">
                    <button onclick="contactarCliente('${p.telefono}', '${esc(p.nombre)}', ${p.saldo}, ${p.diasAtraso})" style="flex:1; padding:8px; background:#25D366; color:white; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                        <i class="fab fa-whatsapp"></i> Contactar
                    </button>
                    <button onclick="marcarPromesaCumplidaHoy('${p.telefono}', ${idx})" style="flex:1; padding:8px; background:#3498db; color:white; border:none; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                        <i class="fas fa-check"></i> Cumplió
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function getPagosPorFecha(fecha) {
    const pagos = [];
    
    // Buscar en promesas
    for (let telefono in promesas) {
        const promesasCliente = promesas[telefono].filter(p => 
            p.fecha === fecha && p.estado === 'pendiente'
        );
        
        if (promesasCliente.length > 0) {
            // Buscar info del cliente
            const cliente = processedClients.find(c => {
                const cPhone = String(c.Teléfono || '').replace(/[^0-9]/g, '');
                const tPhone = String(telefono || '').replace(/[^0-9]/g, '');
                return cPhone === tPhone || cPhone.slice(-10) === tPhone.slice(-10);
            });
            
            promesasCliente.forEach(p => {
                pagos.push({
                    telefono: telefono,
                    nombre: cliente ? cliente.Cliente : 'Cliente',
                    monto: p.monto,
                    nota: p.nota,
                    fecha: p.fecha,
                    saldo: cliente ? cliente.Saldo : 0,
                    diasAtraso: cliente ? cliente['Días Atraso'] : 0
                });
            });
        }
    }
    
    // Buscar en convenios activos
    for (let telefono in convenios) {
        const conv = convenios[telefono];
        if (!conv || conv.estado !== 'activo') continue;
        
        // Calcular si hoy toca pago según frecuencia
        const fechaInicio = new Date(conv.fechaInicio);
        const fechaHoy = new Date(fecha);
        const diffDays = Math.floor((fechaHoy - fechaInicio) / (1000 * 60 * 60 * 24));
        
        let tocaPago = false;
        if (conv.frecuencia === 'semanal' && diffDays % 7 === 0 && diffDays > 0) {
            tocaPago = true;
        } else if (conv.frecuencia === 'quincenal' && diffDays % 15 === 0 && diffDays > 0) {
            tocaPago = true;
        }
        
        if (tocaPago) {
            const cliente = processedClients.find(c => {
                const cPhone = String(c.Teléfono || '').replace(/[^0-9]/g, '');
                const tPhone = String(telefono || '').replace(/[^0-9]/g, '');
                return cPhone === tPhone || cPhone.slice(-10) === tPhone.slice(-10);
            });
            
            if (cliente) {
                pagos.push({
                    telefono: telefono,
                    nombre: cliente.Cliente,
                    monto: conv.montoParcial,
                    nota: `Convenio ${conv.frecuencia} - Pago ${Math.floor(diffDays / (conv.frecuencia === 'semanal' ? 7 : 15))}/${conv.numeroPagos}`,
                    fecha: fecha,
                    saldo: cliente.Saldo,
                    diasAtraso: cliente['Días Atraso'],
                    esConvenio: true
                });
            }
        }
    }
    
    return pagos;
}

function marcarPromesaCumplidaHoy(telefono, index) {
    if (!pagosHoyCache || !pagosHoyCache[index]) return;
    
    const pago = pagosHoyCache[index];
    
    // Abrir modal de cobro directamente
    const cliente = processedClients.find(c => {
        const cPhone = String(c.Teléfono || '').replace(/[^0-9]/g, '');
        const tPhone = String(telefono || '').replace(/[^0-9]/g, '');
        return cPhone === tPhone || cPhone.slice(-10) === tPhone.slice(-10);
    });
    
    if (cliente) {
        openPayModal(cliente.id || cliente.Teléfono, cliente.Teléfono, cliente.Cliente, cliente.Saldo, cliente.SaldoOriginal, cliente.Tarifa);
        
        // Pre-llenar el monto
        document.getElementById('payAmount').value = pago.monto;
        
        // Encontrar índice de promesa en el array original
        const promesasCliente = promesas[telefono] || [];
        const promesaIndex = promesasCliente.findIndex(p => 
            p.fecha === pago.fecha && p.monto === pago.monto && p.estado === 'pendiente'
        );
        
        if (promesaIndex >= 0) {
            // Marcar como cumplida cuando se registre el pago
            marcarPromesaCumplida(telefono, promesaIndex);
        }
    }
    
    closePagosHoy();
}

function contactarCliente(telefono, nombre, saldo, diasAtraso) {
    openWappModal(telefono, nombre, saldo, diasAtraso);
    closePagosHoy();
}

function contactarTodosHoy() {
    if (!pagosHoyCache || pagosHoyCache.length === 0) {
        showToast('❌ No hay clientes para contactar hoy');
        return;
    }
    
    if (!confirm(`¿Generar imágenes de cobranza para ${pagosHoyCache.length} clientes?\n\nEsto puede tardar unos segundos.`)) {
        return;
    }
    
    showLoader('Generando mensajes...');
    
    // Generar todas las imágenes
    let count = 0;
    pagosHoyCache.forEach(async (p, idx) => {
        const cliente = processedClients.find(c => {
            const cPhone = String(c.Teléfono || '').replace(/[^0-9]/g, '');
            const tPhone = String(p.telefono || '').replace(/[^0-9]/g, '');
            return cPhone === tPhone || cPhone.slice(-10) === tPhone.slice(-10);
        });
        
        if (cliente) {
            const mensaje = getMensajeLegal(cliente);
            const imagen = await textoAImagen(mensaje);
            descargarImagen(imagen, `recordatorio_${cliente.Cliente || cliente.Teléfono}.png`);
            count++;
            
            if (count === pagosHoyCache.length) {
                hideLoader();
                showToast(`✅ ${count} imágenes descargadas. Envíalas por WhatsApp`);
            }
        }
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. CALENDARIO SEMANAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function actualizarCalendarioSemana() {
    const calendario = document.getElementById('calendarioSemana');
    const hoy = new Date();
    
    // Obtener lunes de esta semana
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    
    let html = '<div style="margin-bottom:15px; text-align:center; font-weight:600; color:#27AE60;">Semana del ' + formatDateShort(lunes.toISOString().split('T')[0]) + '</div>';
    
    let totalSemana = 0;
    
    for (let i = 0; i < 7; i++) {
        const dia = new Date(lunes);
        dia.setDate(lunes.getDate() + i);
        const fechaStr = dia.toISOString().split('T')[0];
        const pagos = getPagosPorFecha(fechaStr);
        const total = pagos.reduce((sum, p) => sum + p.monto, 0);
        totalSemana += total;
        
        const esHoy = fechaStr === hoy.toISOString().split('T')[0];
        const nombreDia = dia.toLocaleDateString('es-MX', { weekday: 'short' }).toUpperCase();
        const numDia = dia.getDate();
        
        html += `
            <div style="background:${esHoy ? '#e8f5e9' : 'white'}; border-radius:10px; padding:12px; margin-bottom:8px; border-left:4px solid ${esHoy ? '#27AE60' : '#ddd'};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600; color:${esHoy ? '#27AE60' : '#333'};">${nombreDia} ${numDia}</div>
                        <div style="font-size:0.75rem; color:#666;">${pagos.length} pagos</div>
                    </div>
                    <div style="font-size:1.2rem; font-weight:700; color:#27AE60;">$${fmt(total)}</div>
                </div>
                ${pagos.length > 0 ? `
                    <div style="margin-top:8px; font-size:0.7rem; color:#666;">
                        ${pagos.slice(0, 3).map(p => `• ${p.nombre.split(' ')[0]} $${fmt(p.monto)}`).join('<br>')}
                        ${pagos.length > 3 ? `<br>• ...y ${pagos.length - 3} más` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    html = `
        <div style="background:linear-gradient(135deg,#27AE60,#2ECC71); color:white; border-radius:12px; padding:15px; margin-bottom:15px; text-align:center;">
            <div style="font-size:0.8rem; opacity:0.9;">Total Semana</div>
            <div style="font-size:2rem; font-weight:700;">$${fmt(totalSemana)}</div>
        </div>
    ` + html;
    
    calendario.innerHTML = html;
    
    // Actualizar resumen superior
    document.getElementById('periodoActual').textContent = 'ESTA SEMANA';
    document.getElementById('montoEsperado').textContent = '$' + fmt(totalSemana);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. CALENDARIO MENSUAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function actualizarCalendarioMes() {
    const calendario = document.getElementById('calendarioMes');
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    
    const nombreMes = hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    
    let html = `<div style="margin-bottom:15px; text-align:center; font-weight:600; color:#27AE60; text-transform:capitalize;">${nombreMes}</div>`;
    
    let totalMes = 0;
    
    // Agrupar por semanas
    let semanaActual = [];
    let fecha = new Date(primerDia);
    
    while (fecha <= ultimoDia) {
        const fechaStr = fecha.toISOString().split('T')[0];
        const pagos = getPagosPorFecha(fechaStr);
        const total = pagos.reduce((sum, p) => sum + p.monto, 0);
        totalMes += total;
        
        semanaActual.push({
            dia: fecha.getDate(),
            fecha: fechaStr,
            pagos: pagos.length,
            total: total,
            esHoy: fechaStr === hoy.toISOString().split('T')[0]
        });
        
        // Si es domingo o último día, renderizar semana
        if (fecha.getDay() === 0 || fecha.getDate() === ultimoDia.getDate()) {
            html += renderSemanaCalendario(semanaActual);
            semanaActual = [];
        }
        
        fecha.setDate(fecha.getDate() + 1);
    }
    
    html = `
        <div style="background:linear-gradient(135deg,#27AE60,#2ECC71); color:white; border-radius:12px; padding:15px; margin-bottom:15px; text-align:center;">
            <div style="font-size:0.8rem; opacity:0.9;">Total Mes</div>
            <div style="font-size:2rem; font-weight:700;">$${fmt(totalMes)}</div>
        </div>
    ` + html;
    
    calendario.innerHTML = html;
    
    // Actualizar resumen superior
    document.getElementById('periodoActual').textContent = 'ESTE MES';
    document.getElementById('montoEsperado').textContent = '$' + fmt(totalMes);
}

function renderSemanaCalendario(dias) {
    return `
        <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; margin-bottom:8px;">
            ${dias.map(d => `
                <div style="background:${d.esHoy ? '#e8f5e9' : 'white'}; border:2px solid ${d.esHoy ? '#27AE60' : '#eee'}; border-radius:8px; padding:8px; text-align:center; min-height:70px;">
                    <div style="font-weight:700; font-size:0.9rem; color:${d.esHoy ? '#27AE60' : '#333'};">${d.dia}</div>
                    ${d.pagos > 0 ? `
                        <div style="font-size:0.65rem; color:#666; margin-top:4px;">${d.pagos} pagos</div>
                        <div style="font-size:0.75rem; font-weight:600; color:#27AE60; margin-top:2px;">$${fmt(d.total)}</div>
                    ` : `<div style="font-size:0.65rem; color:#ccc; margin-top:4px;">-</div>`}
                </div>
            `).join('')}
        </div>
    `;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. BADGE Y NOTIFICACIONES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function actualizarBadgePagosHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    const pagosHoy = getPagosPorFecha(hoy);
    
    const badge = document.getElementById('badgePagosHoy');
    const btn = document.getElementById('btnPagosHoy');
    
    if (pagosHoy.length > 0) {
        badge.textContent = pagosHoy.length;
        badge.style.display = 'inline-block';
        btn.classList.add('alert');
    } else {
        badge.style.display = 'none';
        btn.classList.remove('alert');
    }
}

// Verificar promesas vencidas
function verificarPromesasVencidas() {
    const hoy = new Date().toISOString().split('T')[0];
    let vencidas = 0;
    
    for (let telefono in promesas) {
        promesas[telefono].forEach((p, idx) => {
            if (p.estado === 'pendiente' && p.fecha < hoy) {
                marcarPromesaIncumplida(telefono, idx);
                vencidas++;
            }
        });
    }
    
    if (vencidas > 0) {
        console.log(`${vencidas} promesas marcadas como incumplidas`);
        localStorage.setItem('promesasPago', JSON.stringify(promesas));
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. FUNCIONES AUXILIARES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatDateShort(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function fmtPhone(phone) {
    if (!phone) return '';
    const p = String(phone).replace(/[^0-9]/g, '');
    if (p.length === 10) {
        return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
    }
    return phone;
}

function esc(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. INICIALIZACIÓN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Llamar al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    // Verificar promesas vencidas al cargar
    verificarPromesasVencidas();
    
    // Actualizar badge
    actualizarBadgePagosHoy();
    
    // Actualizar cada minuto
    setInterval(() => {
        actualizarBadgePagosHoy();
    }, 60000);
});

console.log('✅ Sistema de Promesas de Pago cargado correctamente');
