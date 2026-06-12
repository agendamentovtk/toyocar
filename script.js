// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = "https://kfuadyvymgdydoptzgbh.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmdWFkeXZ5bWdkeWRvcHR6Z2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTAxMjMsImV4cCI6MjA5NjY4NjEyM30.oXW9c7wFHcRMamqSaOmQWZgs8Wwtbk8U7j3isTdXrnI";       

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================================
// 🛠️ CONFIGURAÇÃO CENTRALIZADA (Fácil de alterar dias, horários e vagas)
// =========================================================================
const CONFIG_OFICINA = {
    limiteCaracteresOutros: 150, 
    servicos: [
        { id: "revisao", nome: "Revisão Geral (Troca de Óleo e Filtros)", preco: 150 },
        { id: "outros", nome: "Outros (Avaliação / Diagnóstico)", preco: 0 }
    ],
    
    // Configuração de dias de funcionamento e horários específicos por dia
    // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
    diasTrabalho: {
        1: ["08:00", "09:00", "10:00", "11:00", "13:30", "14:00", "15:00", "16:00", "17:00"], // Segunda
        2: ["08:00", "09:00", "10:00", "11:00", "13:30", "14:00", "15:00", "16:00", "17:00"], // Terça
        3: ["08:00", "09:00", "10:00", "11:00", "13:30", "14:00", "15:00", "16:00", "17:00"], // Quarta
        4: ["08:00", "09:00", "10:00", "11:00", "13:30", "14:00", "15:00", "16:00", "17:00"], // Quinta
        5: ["08:00", "09:00", "10:00", "11:00", "13:30", "14:00", "15:00", "16:00", "17:00"], // Sexta
        6: ["08:00", "09:00", "10:00", "11:00"]                                              // Sábado
        // 0 e 5 (Domingo) não listados significa que a oficina estará fechada!
    },

    // Capacidade de carros simultâneos por faixa de horário (caso queira limitar individualmente)
    capacidadeVagasPadrao: 3, // Quantos elevadores/mânicos livres por horário
    vagasExcecaoPorHora: {
        "11:00": 1, // Exemplo: se às 11:00 o ritmo diminui por causa do almoço
        "17:00": 1  // Exemplo: fim do expediente
    }
};

let meuGraficoOficina = null;

// --- TELA DO CLIENTE (INDEX) ---

function inicializarCliente() {
    if (!document.getElementById('formOficina')) return;

    renderizarServicosCliente();
    
    const dataInput = document.getElementById('dataAgendamento');
    // Bloqueia datas passadas no calendário nativo
    dataInput.min = new Date().toISOString().split('T')[0];
    
    dataInput.addEventListener('change', buscarVagasDisponiveis);
    document.getElementById('formOficina').addEventListener('submit', enviarAgendamento);

    // Máscara Reativa de Telefone (DD) XXXXX-XXXX
    const telInput = document.getElementById('telefone');
    telInput.addEventListener('input', (e) => {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });
}

function renderizarServicosCliente() {
    const container = document.getElementById('servicosContainer');
    if (!container) return;

    container.innerHTML = '';
    CONFIG_OFICINA.servicos.forEach(s => {
        const div = document.createElement('div');
        div.className = "p-3 bg-stone-900/80 border border-stone-800 rounded-xl flex flex-col space-y-3";
        div.innerHTML = `
            <label class="flex items-center space-x-3 cursor-pointer text-stone-200 text-sm">
                <input type="checkbox" name="servicos" value="${s.nome}" class="accent-amber-500 w-4 h-4 rounded" onchange="toggleCaixaOutros()">
                <span>${s.nome}</span>
            </label>
        `;
        container.appendChild(div);
    });

    const txtOutros = document.getElementById('detalhesOutros');
    if (txtOutros) {
        txtOutros.maxLength = CONFIG_OFICINA.limiteCaracteresOutros;
        txtOutros.placeholder = `Descreva brevemente o problema (Máx ${CONFIG_OFICINA.limiteCaracteresOutros} caracteres)...`;
    }
}

function toggleCaixaOutros() {
    const checkboxes = document.querySelectorAll('input[name="servicos"]:checked');
    const containerTextarea = document.getElementById('wrapperOutros');
    let selecionouOutros = false;
    checkboxes.forEach(cb => { if (cb.value.includes("Outros")) selecionouOutros = true; });

    if (selecionouOutros) containerTextarea.classList.remove('hidden');
    else { containerTextarea.classList.add('hidden'); document.getElementById('detalhesOutros').value = ''; }
}

async function buscarVagasDisponiveis() {
    const container = document.getElementById('vagasContainer');
    const dataSelecionada = document.getElementById('dataAgendamento').value;
    if (!container || !dataSelecionada) return;

    container.innerHTML = '<p class="text-xs text-stone-500 col-span-full text-center">Calculando vagas na oficina...</p>';

    // Descobrir o dia da semana da data selecionada (ajustando fuso horário)
    const partesData = dataSelecionada.split('-');
    const objetoData = new Date(partesData[0], partesData[1] - 1, partesData[2]);
    const diaSemana = objetoData.getDay(); 

    // Verifica se a oficina trabalha no dia escolhido
    if (!CONFIG_OFICINA.diasTrabalho[diaSemana]) {
        container.innerHTML = '<p class="text-xs text-amber-500 col-span-full text-center py-2">A oficina não possui expediente neste dia (Fechado).</p>';
        return;
    }

    // Busca os horários configurados para aquele dia específico
    const horariosDoDia = CONFIG_OFICINA.diasTrabalho[diaSemana];

    const { data: agendados, error } = await supabaseClient
        .from('agendamentos_oficina')
        .select('horario')
        .eq('data', dataSelecionada);

    if (error) { container.innerHTML = '<p class="text-xs text-red-500 col-span-full text-center">Erro ao buscar agenda.</p>'; return; }

    const contagemPorHora = {};
    agendados.forEach(a => { contagemPorHora[a.horario] = (contagemPorHora[a.horario] || 0) + 1; });

    container.innerHTML = '';
    let encontrouHorario = false;

    horariosDoDia.forEach(hora => {
        // Define dinamicamente o limite de vagas para aquela hora
        const limiteVagas = CONFIG_OFICINA.vagasExcecaoPorHora[hora] !== undefined 
            ? CONFIG_OFICINA.vagasExcecaoPorHora[hora] 
            : CONFIG_OFICINA.capacidadeVagasPadrao;

        const carrosAgendados = contagemPorHora[hora] || 0;
        const vagasRestantes = limiteVagas - carrosAgendados;

        if (vagasRestantes > 0) {
            encontrouHorario = true;
            const label = document.createElement('label');
            label.className = "cursor-pointer group";
            label.innerHTML = `
                <input type="radio" name="horario" value="${hora}" required class="peer hidden">
                <div class="p-3 bg-stone-950 border border-stone-850 rounded-xl text-center transition-all peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600">
                    <span class="block text-sm font-bold">${hora}</span>
                    <span class="text-[10px] opacity-60 block mt-0.5">${vagasRestantes} vaga(s)</span>
                </div>
            `;
            container.appendChild(label);
        }
    });

    if (!encontrouHorario) {
        container.innerHTML = '<p class="text-xs text-amber-500 col-span-full text-center py-2">Nenhum elevador/vaga disponível para os horários deste dia.</p>';
    }
}

async function enviarAgendamento(e) {
    e.preventDefault();

    const checkboxes = document.querySelectorAll('input[name="servicos"]:checked');
    if (checkboxes.length === 0) { alert("Escolha pelo menos um motivo para o agendamento!"); return; }

    const listaServicos = Array.from(checkboxes).map(cb => cb.value).join(', ');
    const dados = {
        cliente_nome: document.getElementById('nome').value,
        veiculo_modelo: document.getElementById('modelo').value,
        servicos_selecionados: listaServicos,
        detalhes_outros: document.getElementById('detalhesOutros').value,
        data: document.getElementById('dataAgendamento').value,
        horario: document.querySelector('input[name="horario"]:checked').value
    };

    const { error } = await supabaseClient.from('agendamentos_oficina').insert([dados]);

    if (error) {
        alert("Erro no agendamento: " + error.message);
    } else {
        // --- ANTES: Usava alert() nativo. AGORA: Usa o Modal Premium ---
        const dataFormatada = dados.data.split('-').reverse().join('/');
        const msgModal = `Olá <strong>${dados.cliente_nome}</strong>, seu veículo <strong>${dados.veiculo_modelo}</strong> foi mapeado para o dia <strong>${dataFormatada}</strong> às <strong class="text-red-500">${dados.horario}</strong>.`;
        
        document.getElementById('modalMensagemTexto').innerHTML = msgModal;
        
        // Configura o link direto do Google Agenda no botão do modal
        const urlCalendario = gerarUrlCalendarioUniversal(dados.cliente_nome, dados.data, dados.horario, listaServicos);
        document.getElementById('btnAdicionarAgenda').href = urlCalendario;

        // Exibe o modal na tela tirando a classe 'hidden'
        document.getElementById('modalSucesso').classList.remove('hidden');

        // Limpa o formulário de fundo de forma limpa
        document.getElementById('formOficina').reset();
        document.getElementById('wrapperOutros').classList.add('hidden');
        document.getElementById('vagasContainer').innerHTML = '<p class="text-xs text-stone-500 col-span-full text-center py-2">Selecione uma data para checar as vagas.</p>';
    }
}

// --- NOVA FUNÇÃO: GERA LINK DIRETO PARA O GOOGLE AGENDA (SEM ARQUIVO) ---
// --- FUNÇÃO: GERA LINK UNIVERSAL QUE ABRE O APP PADRÃO DE CALENDÁRIO DO CELULAR ---
function gerarUrlCalendarioUniversal(nome, dataStr, horarioStr, servicos) {
    // Monta o objeto de data inicial (Ano, Mês [0-11], Dia, Hora, Minuto)
    const partesData = dataStr.split('-');
    const partesHora = horarioStr.split(':');
    
    const dataInicio = new Date(partesData[0], partesData[1] - 1, partesData[2], partesHora[0], partesHora[1]);
    const dataFim = new Date(dataInicio.getTime() + 60 * 60 * 1000); // 1 hora de duração padrão

    // Formata as datas no padrão exigido pelo protocolo iCalendar (AAAAMMDDTHHMMSSZ)
    const formatarDataICS = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
    
    // Cria a estrutura padrão de um arquivo .ics (iCalendar)
    const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TOYOCAR//Agendamento//PT",
        "BEGIN:VEVENT",
        `UID:${Date.now()}@toyocar.com`, // Identificador único do evento
        `DTSTART:${formatarDataICS(dataInicio)}`,
        `DTEND:${formatarDataICS(dataFim)}`,
        `SUMMARY:Manutenção TOYOCAR - ${nome}`,
        `DESCRIPTION:Serviços: ${servicos}.\\nPor favor\\, comparecer com o veículo no horário marcado.`,
        "LOCATION:Oficina Mecânica TOYOCAR",
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");

    // Codifica o conteúdo em Base64 para que o navegador entenda como um link de dados direto,
    // eliminando a necessidade de criar e baixar um arquivo físico na pasta de downloads.
    const base64Content = btoa(unescape(encodeURIComponent(icsContent)));
    return `data:text/calendar;charset=utf-8;base64,${base64Content}`;
}

// --- FUNÇÃO PARA FECHAR O MODAL ---
function fecharModalSucesso() {
    document.getElementById('modalSucesso').classList.add('hidden');
}

// --- PAINEL ADMINISTRATIVO (DASHBOARD) ---

async function verificarSessaoOficina() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const loginSec = document.getElementById('loginSection');
    const dashSec = document.getElementById('dashboardSection');

    if (session) {
        if(loginSec) loginSec.classList.add('hidden');
        if(dashSec) dashSec.classList.remove('hidden');
        
        const filtro = document.getElementById('filtroMes');
        if (filtro && filtro.children.length === 0) {
            const hoje = new Date();
            const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

            for (let i = -3; i <= 6; i++) {
                const dataCalculada = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
                const anoOpcao = dataCalculada.getFullYear();
                const mesOpcaoIndex = dataCalculada.getMonth();
                const numeroMes = String(mesOpcaoIndex + 1).padStart(2, '0');
                const valorOption = `${anoOpcao}-${numeroMes}`;
                
                const option = document.createElement('option');
                option.value = valorOption;
                option.text = `${nomesMeses[mesOpcaoIndex]} de ${anoOpcao}`;
                option.className = "bg-stone-900 text-stone-100 py-2";
                if (anoOpcao === hoje.getFullYear() && mesOpcaoIndex === hoje.getMonth()) option.selected = true;
                
                filtro.appendChild(option);
            }
        }
        carregarPainelOficina();
    } else {
        if(loginSec) loginSec.classList.remove('hidden');
        if(dashSec) dashSec.classList.add('hidden');
    }
}

async function logarOficina(e) {
    e.preventDefault();
    const { error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginSenha').value
    });
    if (error) alert("Erro: " + error.message); else verificarSessaoOficina();
}

async function carregarPainelOficina() {
    const mes = document.getElementById('filtroMes').value;
    if (!mes) return;

    const partes = mes.split('-');
    const dataInicio = `${mes}-01`;
    const dataFim = `${mes}-${new Date(partes[0], partes[1], 0).getDate()}`;

    const { data, error } = await supabaseClient
        .from('agendamentos_oficina')
        .select('*')
        .gte('data', dataInicio)
        .lte('data', dataFim)
        .order('data', { ascending: true })
        .order('horario', { ascending: true });

    if (error) return console.error("Erro ao buscar dados do Supabase:", error);

    const tHoje = document.getElementById('tabelaHoje');
    const tAmanha = document.getElementById('tabelaAmanha');
    const tSemana = document.getElementById('tabelaSemana');
    const tFuturos = document.getElementById('tabelaFuturos');
    const tPassados = document.getElementById('tabelaPassadosCorpo');

    tHoje.innerHTML = ''; tAmanha.innerHTML = ''; tSemana.innerHTML = ''; tFuturos.innerHTML = ''; tPassados.innerHTML = '';
    
    let faturamentoTotal = 0;
    const metricas = {};
    CONFIG_OFICINA.servicos.forEach(s => metricas[s.nome] = { qtd: 0, valor: 0 });

    const agora = new Date();
    const hojeStr = agora.toISOString().split('T')[0];
    
    const amanha = new Date(agora); amanha.setDate(agora.getDate() + 1);
    const amanhaStr = amanha.toISOString().split('T')[0];

    const seteDiasDepois = new Date(agora); seteDiasDepois.setDate(agora.getDate() + 7);
    const seteDiasStr = seteDiasDepois.toISOString().split('T')[0];
    
    const horaAgoraStr = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;

    if (!data || data.length === 0) {
        const trVazio = '<tr><td colspan="6" class="p-4 text-center text-stone-500 text-xs">Nenhum veículo mapeado nesta régua.</td></tr>';
        tHoje.innerHTML = trVazio; tAmanha.innerHTML = trVazio; tSemana.innerHTML = trVazio; tFuturos.innerHTML = trVazio;
        tPassados.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-stone-500 text-xs">Nenhum histórico mapeado.</td></tr>';
        document.getElementById('faturamentoTotal').innerText = "R$ 0,00";
        renderizarGraficoOficina(metricas);
        return;
    }

    let [cHoje, cAmanha, cSemana, cFuturos, cPassados] = [0, 0, 0, 0, 0];

    data.forEach((ag, idx) => {
        const servicos = ag.servicos_selecionados.split(', ');
        let totalAgendamento = 0;
        let linhasDetalhadas = [];

        servicos.forEach(sName => {
            const config = CONFIG_OFICINA.servicos.find(s => s.nome === sName);
            const preco = config ? config.preco : 0;
            faturamentoTotal += preco;
            totalAgendamento += preco;

            if (metricas[sName]) { metricas[sName].qtd += 1; metricas[sName].valor += preco; }
            linhasDetalhadas.push(`${sName} (R$ ${preco.toFixed(2)})`);
        });

        if (ag.detalhes_outros) linhasDetalhadas.push(`<span class="opacity-80">Sintomas: "${ag.detalhes_outros}"</span>`);

        const foneLimpo = ag.cliente_telefone.replace(/\D/g, '');
        const dataFormatada = ag.data.split('-').reverse().join('/');
        const mensagemWhats = encodeURIComponent(`Olá ${ag.cliente_nome}, tudo bem? Gostaria de relembrar sobre a revisão do seu veículo agendada na TOYOCAR para o dia ${dataFormatada} às ${ag.horario}. Podemos confirmar sua presença?`);
        const urlWhats = `https://api.whatsapp.com/send?phone=55${foneLimpo}&text=${mensagemWhats}`;

        let blocoAlvo = "";
        let ehPassado = false;

        if (ag.data < hojeStr || (ag.data === hojeStr && ag.horario < horaAgoraStr)) {
            ehPassado = true;
            blocoAlvo = "passado";
            cPassados++;
        } else if (ag.data === hojeStr) {
            blocoAlvo = "hoje";
            cHoje++;
        } else if (ag.data === amanhaStr) {
            blocoAlvo = "amanha";
            cAmanha++;
        } else if (ag.data > amanhaStr && ag.data <= seteDiasStr) {
            blocoAlvo = "semana";
            cSemana++;
        } else {
            blocoAlvo = "futuro";
            cFuturos++;
        }

        const tr = document.createElement('tr');
        const trDet = document.createElement('tr');
        trDet.id = `det-${blocoAlvo}-${idx}`;
        trDet.className = "hidden bg-stone-950/40";

        if (ehPassado) {
            tr.className = "cursor-pointer hover:bg-stone-900/20 border-b border-stone-900/30 text-stone-500";
            tr.innerHTML = `
                <td class="p-4 opacity-60 font-medium">${ag.cliente_nome}</td>
                <td class="p-4 text-xs opacity-60">${ag.veiculo_modelo}</td>
                <td class="p-4 text-xs truncate max-w-[180px] opacity-60">${ag.servicos_selecionados}</td>
                <td class="p-4 text-xs">${dataFormatada} às ${ag.horario}</td>
            `;
            tr.onclick = () => trDet.classList.toggle('hidden');
            trDet.innerHTML = `
                <td colspan="4" class="p-4 text-xs">
                    <div class="bg-stone-950/20 p-3 rounded-lg border border-stone-900/40 font-mono">
                        ${linhasDetalhadas.join('<br>')}
                        <div class="mt-2 pt-2 border-t border-stone-900/40 font-bold text-stone-400">Total: R$ ${totalAgendamento.toFixed(2)}</div>
                    </div>
                </td>
            `;
            tPassados.appendChild(tr);
            tPassados.appendChild(trDet);
        } else {
            tr.className = "cursor-pointer hover:bg-stone-900/40 border-b border-stone-800/40 transition-colors";
            
            const tdDataHora = (blocoAlvo === 'hoje' || blocoAlvo === 'amanha') 
                ? `<td class="p-4 font-semibold text-red-500 text-sm">${ag.horario}</td>`
                : `<td class="p-4 text-stone-300 text-xs font-medium">${dataFormatada}<br><span class="text-red-500 font-semibold text-sm">${ag.horario}</span></td>`;

            tr.innerHTML = `
                <td class="p-4 font-medium text-stone-200" onclick="document.getElementById('${trDet.id}').classList.toggle('hidden')">
                    ${ag.cliente_nome}<br><span class="text-[10px] text-stone-400">${ag.cliente_telefone}</span>
                </td>
                <td class="p-4 text-stone-300 text-xs" onclick="document.getElementById('${trDet.id}').classList.toggle('hidden')">${ag.veiculo_modelo}</td>
                <td class="p-4 text-xs text-stone-400 truncate max-w-[160px]" onclick="document.getElementById('${trDet.id}').classList.toggle('hidden')">${ag.servicos_selecionados}</td>
                <td class="p-4">
                    <a href="${urlWhats}" target="_blank" class="inline-flex items-center space-x-1 bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-emerald-900 transition-colors">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Confirmar</span>
                    </a>
                </td>
                ${tdDataHora}
                <td class="p-4 text-center">
                    <button onclick="removerAgendamento('${ag.id}', '${ag.cliente_nome}')" class="text-[11px] bg-stone-950 border border-stone-800 text-stone-400 hover:text-red-500 hover:border-red-900/60 px-2.5 py-1 rounded-lg font-medium transition-all">
                        Ausente / Excluir
                    </button>
                </td>
            `;

            trDet.innerHTML = `
                <td colspan="6" class="p-4 text-xs">
                    <div class="bg-stone-900/60 p-3 rounded-lg border border-stone-800 space-y-2">
                        <p class="font-bold text-red-600 uppercase text-[10px]">Detalhamento Técnico:</p>
                        <div class="font-mono text-stone-300 space-y-1">${linhasDetalhadas.join('<br>')}</div>
                        <div class="border-t border-stone-800 pt-2 flex justify-between font-bold text-sm">
                            <span class="text-stone-400">Total Previsto:</span>
                            <span class="text-emerald-400">R$ ${totalAgendamento.toFixed(2).replace('.', ',')}</span>
                        </div>
                    </div>
                </td>
            `;

            if (blocoAlvo === "hoje") { tHoje.appendChild(tr); tHoje.appendChild(trDet); }
            else if (blocoAlvo === "amanha") { tAmanha.appendChild(tr); tAmanha.appendChild(trDet); }
            else if (blocoAlvo === "semana") { tSemana.appendChild(tr); tSemana.appendChild(trDet); }
            else if (blocoAlvo === "futuro") { tFuturos.appendChild(tr); tFuturos.appendChild(trDet); }
        }
    });

    const stringVazia = '<tr><td colspan="6" class="p-4 text-center text-stone-600 text-xs">Nenhum veículo nesta listagem.</td></tr>';
    if (cHoje === 0) tHoje.innerHTML = stringVazia;
    if (cAmanha === 0) tAmanha.innerHTML = stringVazia;
    if (cSemana === 0) tSemana.innerHTML = stringVazia;
    if (cFuturos === 0) tFuturos.innerHTML = stringVazia;
    if (cPassados === 0) tPassados.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-stone-600 text-xs">Nenhum histórico registrado.</td></tr>';

    document.getElementById('faturamentoTotal').innerText = `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`;
    renderizarGraficoOficina(metricas);
}

async function removerAgendamento(id, nomeCliente) {
    if (confirm(`Deseja realmente remover o agendamento de "${nomeCliente}"? Isso reabrirá a vaga imediatamente no sistema.`)) {
        const { error } = await supabaseClient
            .from('agendamentos_oficina')
            .delete()
            .eq('id', id);

        if (error) alert("Erro ao excluir: " + error.message);
        else { alert("Agendamento removido com sucesso!"); carregarPainelOficina(); }
    }
}

function toggleSecao(idContainer, idSeta) {
    const container = document.getElementById(idContainer);
    const seta = document.getElementById(idSeta);
    if (!container || !seta) return;

    container.classList.toggle('hidden');
    if (container.classList.contains('hidden')) seta.classList.add('rotate-180');
    else seta.classList.remove('rotate-180');
}

function renderizarGraficoOficina(metricas) {
    const legenda = document.getElementById('legendaGrafico');
    if (!legenda) return;
    legenda.innerHTML = '';

    const labels = []; const dados = []; const cores = ['#dc2626', '#3b82f6', '#eab308'];

    Object.keys(metricas).forEach((name, i) => {
        const item = metricas[name]; labels.push(name); dados.push(item.qtd);
        const div = document.createElement('div');
        div.className = "flex items-center space-x-3 p-2 bg-stone-950 border border-stone-850 rounded-lg";
        div.innerHTML = `
            <div class="w-2.5 h-2.5 rounded-full" style="background-color: ${cores[i % cores.length]}"></div>
            <div>
                <p class="text-stone-300 text-xs font-medium">${name}</p>
                <p class="text-stone-500 text-[11px]">${item.qtd} veículo(s) • <span class="text-stone-400">R$ ${item.valor.toFixed(2)}</span></p>
            </div>
        `;
        legenda.appendChild(div);
    });

    const ctx = document.getElementById('graficoServicos');
    if (!ctx) return;
    if (meuGraficoOficina) meuGraficoOficina.destroy();

    const temDados = dados.reduce((a,b) => a+b, 0) > 0;

    meuGraficoOficina = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: temDados ? labels : ['Sem ordens'],
            datasets: [{ data: temDados ? dados : [1], backgroundColor: temDados ? cores : ['#292524'], borderWidth: 0 }]
        },
        options: { plugins: { legend: { display: false } }, cutout: '75%', responsive: true }
    });
}

async function deslogar() { await supabaseClient.auth.signOut(); verificarSessaoOficina(); }