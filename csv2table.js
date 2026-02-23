class Csv2Table {
    /**
     * @param {Object} options Options object
     * @param {string} options.containerId ID of the container element
     * @param {string} [options.csvUrl] URL to the CSV file
     * @param {string} [options.csvData] Raw CSV data string
     * @param {Array} [options.columns] Array of column configs e.g. [{type: 'number'}, {type: 'string'}]
     * @param {boolean} [options.responsive=true] True for responsive stacking, false for horizontal scroll
     */
    constructor(options) {
        this.containerId = options.containerId;
        this.csvUrl = options.csvUrl;
        this.csvData = options.csvData;
        this.columns = options.columns || [];
        this.initialSearch = options.initialSearch || '';
        this.hiddenColumns = options.hiddenColumns || [];
        this.onRenderComplete = options.onRenderComplete || null;
        this.responsive = options.responsive !== undefined ? options.responsive : true;
        this.i18n = Object.assign({
            searchPlaceholder: 'Search...',
            filterColumns: 'Filter Columns \u25bc',
            noData: 'No data found',
            errorLoading: 'Error loading CSV data.'
        }, options.i18n || {});

        this.data = [];
        this.headers = [];
        this.sortColumn = null;
        this.sortAsc = true;
        this.searchQuery = '';
        this.searchAST = null;
        this.visibleColumns = new Set();

        this.init();
    }

    async init() {
        if (this.csvUrl) {
            try {
                const response = await fetch(this.csvUrl);
                if (!response.ok) throw new Error("HTTP " + response.status);
                const text = await response.text();
                this.parseCsv(text);
            } catch (error) {
                console.error("Failed to load CSV from URL:", error);
                const container = document.getElementById(this.containerId);
                if (container) container.innerHTML = `<p style="color:red;">${this.i18n.errorLoading}</p>`;
                return;
            }
        } else if (this.csvData) {
            this.parseCsv(this.csvData);
        }

        this.searchQuery = this.initialSearch;
        this.searchAST = this.parseSearchQuery(this.searchQuery) || null;

        this.headers.forEach((h, i) => {
            // Check if column name or index is in hiddenColumns array
            const isHidden = this.hiddenColumns.includes(i) || this.hiddenColumns.includes(h);
            if (!isHidden) {
                this.visibleColumns.add(i);
            }
        });

        this.renderShell();
        this.renderTable();
    }

    parseCsv(text) {
        text = text.replace(/\r/g, '');
        const lines = text.trim().split('\n');
        if (lines.length === 0) return;

        this.headers = this.parseCsvLine(lines[0]);
        this.data = lines.slice(1).map(line => this.parseCsvLine(line));
    }

    parseCsvLine(text) {
        let ret = [], inQuote = false, value = '';
        for (let i = 0; i < text.length; i++) {
            let char = text[i];
            if (inQuote) {
                if (char === '"') {
                    if (i < text.length - 1 && text[i + 1] === '"') {
                        value += '"';
                        i++;
                    } else {
                        inQuote = false;
                    }
                } else {
                    value += char;
                }
            } else {
                if (char === '"') {
                    inQuote = true;
                } else if (char === ',') {
                    ret.push(value);
                    value = '';
                } else {
                    value += char;
                }
            }
        }
        ret.push(value);
        return ret;
    }

    parseDateString(dateStr, format) {
        if (!dateStr || dateStr.trim() === '-' || dateStr.trim() === '') return NaN;
        if (!format) {
            const d = new Date(dateStr).getTime();
            return isNaN(d) ? NaN : d;
        }

        const escapedFormat = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let patternStr = escapedFormat
            .replace('YYYY', '(?<YYYY>\\d{4})')
            .replace('YY', '(?<YY>\\d{2})')
            .replace('Mmm', '(?<Mmm>[^\\d\\s\\/\\-.,]+)')
            .replace('MM', '(?<MM>\\d{2})')
            .replace('M', '(?<M>\\d{1,2})')
            .replace('DD', '(?<DD>\\d{2})')
            .replace('D', '(?<D>\\d{1,2})')
            .replace('HH', '(?<HH>\\d{2})')
            .replace('H', '(?<H>\\d{1,2})')
            .replace('mm', '(?<mm>\\d{2})')
            .replace('m', '(?<m>\\d{1,2})')
            .replace('ss', '(?<ss>\\d{2})')
            .replace('s', '(?<s>\\d{1,2})')
            .replace('Www', '(?<Www>[^\\d\\s\\/\\-.,]+)')
            .replace('Z', '(?<Z>Z|[+-]\\d{2}:?\\d{2}|[+-]\\d{4})');

        try {
            const regex = new RegExp(`^${patternStr}$`);
            const match = String(dateStr).trim().match(regex);

            if (match && match.groups) {
                const g = match.groups;
                let year = 1970, month = 0, day = 1, hours = 0, minutes = 0, seconds = 0;

                if (g.YYYY) year = parseInt(g.YYYY, 10);
                else if (g.YY) {
                    const y = parseInt(g.YY, 10);
                    year = y >= 70 ? 1900 + y : 2000 + y;
                }

                if (g.MM) month = parseInt(g.MM, 10) - 1;
                else if (g.M) month = parseInt(g.M, 10) - 1;
                else if (g.Mmm) {
                    const mName = g.Mmm.toLowerCase();
                    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    const mIdx = months.findIndex(m => mName.startsWith(m));
                    if (mIdx !== -1) month = mIdx;
                }

                if (g.DD) day = parseInt(g.DD, 10);
                else if (g.D) day = parseInt(g.D, 10);

                if (g.HH) hours = parseInt(g.HH, 10);
                else if (g.H) hours = parseInt(g.H, 10);

                if (g.mm) minutes = parseInt(g.mm, 10);
                else if (g.m) minutes = parseInt(g.m, 10);

                if (g.ss) seconds = parseInt(g.ss, 10);
                else if (g.s) seconds = parseInt(g.s, 10);

                if (g.Z) {
                    const pad = n => String(n).padStart(2, '0');
                    const yyyy = String(year).padStart(4, '0');
                    let z = g.Z;
                    if (z === 'Z' || z === 'z') z = 'Z';
                    else if (z.length === 5) z = z.substring(0, 3) + ':' + z.substring(3); // +0900 -> +09:00
                    const iso = `${yyyy}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}${z}`;
                    const timestamp = Date.parse(iso);
                    if (!isNaN(timestamp)) return timestamp;
                }

                return new Date(year, month, day, hours, minutes, seconds).getTime();
            }
        } catch (e) {
            console.error("Date parse error", e);
        }

        const fallback = new Date(dateStr).getTime();
        return isNaN(fallback) ? NaN : fallback;
    }

    parseSearchQuery(query) {
        if (!query || !query.trim()) return null;

        const tokens = [];
        let i = 0;
        while (i < query.length) {
            let char = query[i];
            if (/\s/.test(char)) {
                i++;
                continue;
            }
            if (char === '(') {
                tokens.push({ type: 'LPAREN' });
                i++;
                continue;
            }
            if (char === ')') {
                tokens.push({ type: 'RPAREN' });
                i++;
                continue;
            }

            let match = query.slice(i).match(/^(AND\b|OR\b)/i);
            if (match) {
                tokens.push({ type: match[1].toUpperCase() });
                i += match[0].length;
                continue;
            }

            let isColMatch = query.slice(i).match(/^([^:()<>=!\s]+):/);
            let column = null;
            if (isColMatch) {
                column = isColMatch[1];
                i += isColMatch[0].length;
            }

            let operatorMatch = query.slice(i).match(/^(>=|<=|>|<)/);
            let operator = null;
            if (operatorMatch) {
                operator = operatorMatch[1];
                i += operatorMatch[0].length;
            }

            let value = "";
            if (query[i] === '"') {
                i++;
                while (i < query.length && query[i] !== '"') {
                    value += query[i];
                    i++;
                }
                if (i < query.length) i++; // skip closing quote
            } else {
                while (i < query.length && !/\s|\(|\)/.test(query[i])) {
                    value += query[i];
                    i++;
                }
            }
            if (value || column) {
                if (operator) {
                    tokens.push({ type: 'INEQUALITY', column, operator, value: value.toLowerCase() });
                } else {
                    tokens.push({ type: 'TERM', column, value: value.toLowerCase() });
                }
            }
        }

        let pos = 0;

        function parseTerm() {
            if (pos >= tokens.length) return null;
            let token = tokens[pos];
            if (token.type === 'LPAREN') {
                pos++;
                let node = parseOr();
                if (pos < tokens.length && tokens[pos].type === 'RPAREN') {
                    pos++;
                }
                return node;
            } else if (token.type === 'TERM' || token.type === 'INEQUALITY') {
                pos++;
                return token;
            }
            pos++;
            return null;
        }

        function parseAnd() {
            let node = parseTerm();
            while (pos < tokens.length && (tokens[pos].type === 'AND' || tokens[pos].type === 'TERM' || tokens[pos].type === 'INEQUALITY' || tokens[pos].type === 'LPAREN')) {
                if (tokens[pos].type === 'AND') {
                    pos++;
                }
                let right = parseTerm();
                if (node && right) {
                    node = { type: 'AND', left: node, right: right };
                } else if (right) {
                    node = right;
                }
            }
            return node;
        }

        function parseOr() {
            let node = parseAnd();
            while (pos < tokens.length && tokens[pos].type === 'OR') {
                pos++;
                let right = parseAnd();
                if (node && right) {
                    node = { type: 'OR', left: node, right: right };
                } else if (right) {
                    node = right;
                }
            }
            return node;
        }

        return parseOr();
    }

    evaluateSearchAST(ast, row) {
        if (!ast) return true;
        if (ast.type === 'OR') {
            return this.evaluateSearchAST(ast.left, row) || this.evaluateSearchAST(ast.right, row);
        }
        if (ast.type === 'AND') {
            return this.evaluateSearchAST(ast.left, row) && this.evaluateSearchAST(ast.right, row);
        }
        if (ast.type === 'INEQUALITY') {
            let targetColIndex = -1;
            if (ast.column) {
                targetColIndex = this.headers.findIndex(h => h.toLowerCase() === ast.column.toLowerCase());
            }

            const searchValNum = parseFloat(ast.value);

            let searchValDate = NaN;
            if (/^\d{4}$/.test(ast.value)) {
                searchValDate = new Date(parseInt(ast.value, 10), 0, 1).getTime();
            } else {
                searchValDate = !isNaN(Date.parse(ast.value)) ? new Date(ast.value).getTime() : NaN;
            }

            const evaluateCell = (cellValStr, colIndex) => {
                const colConfig = this.columns[colIndex] || {};
                const type = colConfig.type || 'string';

                let sVal, cVal;

                if (type === 'date') {
                    const cellDate = this.parseDateString(cellValStr, colConfig.format);
                    if (!isNaN(cellDate) && !isNaN(searchValDate)) {
                        sVal = searchValDate;
                        cVal = cellDate;
                    } else {
                        return false;
                    }
                } else {
                    let cellNum = parseFloat(cellValStr.replace(/[^\d.-]/g, ''));
                    let cellDate = isNaN(new Date(cellValStr).getTime()) ? NaN : new Date(cellValStr).getTime();

                    if (!isNaN(cellNum) && !isNaN(searchValNum)) {
                        sVal = searchValNum;
                        cVal = cellNum;
                    } else if (!isNaN(cellDate) && !isNaN(searchValDate)) {
                        sVal = searchValDate;
                        cVal = cellDate;
                    } else {
                        return false; // Can't compare mathematically
                    }
                }

                if (ast.operator === '>=') return cVal >= sVal;
                if (ast.operator === '<=') return cVal <= sVal;
                if (ast.operator === '>') return cVal > sVal;
                if (ast.operator === '<') return cVal < sVal;
                return false;
            };

            if (targetColIndex !== -1) {
                return evaluateCell(String(row[targetColIndex] || ''), targetColIndex);
            } else {
                return row.some((cell, i) => {
                    if (!this.visibleColumns.has(i)) return false;
                    return evaluateCell(String(cell || ''), i);
                });
            }
        }

        if (ast.type === 'TERM') {
            let targetColIndex = -1;
            if (ast.column) {
                targetColIndex = this.headers.findIndex(h => h.toLowerCase() === ast.column.toLowerCase());
            }

            let searchVal = ast.value;
            let regexStr = searchVal.replace(/[.*+?{}()|[\]\\]/g, '\\$&'); // Escape regex chars except ^ and $

            // Handle ^ at the start
            if (regexStr.startsWith('^')) {
                // It's already ^, which is correct for regex
                // But we don't want to escape it if it was entered
            } else {
                regexStr = regexStr;
            }

            // More properly: Let's extract ^ and $ manually
            let isStartsWith = false;
            let isEndsWith = false;

            if (searchVal.startsWith('^')) {
                isStartsWith = true;
                searchVal = searchVal.substring(1);
            }
            if (searchVal.endsWith('$')) {
                isEndsWith = true;
                searchVal = searchVal.substring(0, searchVal.length - 1);
            }

            let escapedVal = searchVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            let finalRegexStr = escapedVal;
            if (isStartsWith) finalRegexStr = '^' + finalRegexStr;
            if (isEndsWith) finalRegexStr = finalRegexStr + '$';

            const regex = new RegExp(finalRegexStr, 'i'); // case insensitive

            if (targetColIndex !== -1) {
                const colConfig = this.columns[targetColIndex] || {};
                let cellVal = String(row[targetColIndex] || '');
                if (colConfig.type === 'date' && typeof colConfig.toString === 'string') {
                    cellVal = this.formatDate(cellVal, colConfig.format, colConfig.toString, colConfig.locale);
                }
                cellVal = cellVal.toLowerCase();
                return regex.test(cellVal);
            } else {
                return row.some((cell, i) => {
                    if (!this.visibleColumns.has(i)) return false;
                    const colConfig = this.columns[i] || {};
                    let cellVal = String(cell || '');
                    if (colConfig.type === 'date' && typeof colConfig.toString === 'string') {
                        cellVal = this.formatDate(cellVal, colConfig.format, colConfig.toString, colConfig.locale);
                    }
                    cellVal = cellVal.toLowerCase();
                    return regex.test(cellVal);
                });
            }
        }
        return true;
    }

    renderShell() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        container.classList.add('csv2table-container');

        const controls = document.createElement('div');
        controls.className = 'csv2table-controls';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = this.i18n.searchPlaceholder;
        searchInput.className = 'csv2table-search';
        searchInput.value = this.searchQuery;
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.searchAST = this.parseSearchQuery(this.searchQuery);
            this.renderTable();
        });
        controls.appendChild(searchInput);

        const colFilterBtn = document.createElement('button');
        colFilterBtn.className = 'csv2table-col-filter-btn';
        colFilterBtn.textContent = this.i18n.filterColumns;

        const colFilterDropdown = document.createElement('div');
        colFilterDropdown.className = 'csv2table-col-filter-dropdown';
        colFilterDropdown.style.display = 'none';

        document.addEventListener('click', (e) => {
            if (!controls.contains(e.target)) {
                colFilterDropdown.style.display = 'none';
            }
        });

        colFilterBtn.addEventListener('click', () => {
            colFilterDropdown.style.display = colFilterDropdown.style.display === 'none' ? 'block' : 'none';
        });

        this.headers.forEach((h, i) => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.visibleColumns.has(i);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.visibleColumns.add(i);
                } else {
                    this.visibleColumns.delete(i);
                }
                this.renderTable();
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + h));
            colFilterDropdown.appendChild(label);
        });

        const colFilterWrapper = document.createElement('div');
        colFilterWrapper.className = 'csv2table-col-filter-wrapper';
        colFilterWrapper.appendChild(colFilterBtn);
        colFilterWrapper.appendChild(colFilterDropdown);
        controls.appendChild(colFilterWrapper);

        container.appendChild(controls);

        this.tableWrapper = document.createElement('div');
        this.tableWrapper.className = `csv2table-wrapper ${this.responsive ? 'responsive' : 'scroll'}`;
        container.appendChild(this.tableWrapper);
    }

    formatNumber(valueStr, formatStr, locale) {
        if (!valueStr && valueStr !== 0 && valueStr !== '0') return '';
        let num = parseFloat(String(valueStr).replace(/[^\d.-]/g, ''));
        if (isNaN(num)) return valueStr;

        if (typeof formatStr !== 'string') return String(num);

        const match = formatStr.trim().match(/^([a-zA-Z])(\d*)$/);
        if (!match) return String(num);

        const type = match[1].toUpperCase();
        const digitsStr = match[2];
        const digits = digitsStr ? parseInt(digitsStr, 10) : undefined;

        try {
            switch (type) {
                case 'D': {
                    const intNum = Math.trunc(num);
                    const isNegative = intNum < 0;
                    let absStr = Math.abs(intNum).toString();
                    if (digits !== undefined) {
                        absStr = absStr.padStart(digits, '0');
                    }
                    return (isNegative ? '-' : '') + absStr;
                }
                case 'G': {
                    if (digits !== undefined && digits > 0) {
                        return parseFloat(num.toPrecision(digits)).toString();
                    }
                    return num.toString();
                }
                case 'N': {
                    const fractionDigits = digits !== undefined ? digits : 2;
                    return new Intl.NumberFormat(locale || undefined, {
                        minimumFractionDigits: fractionDigits,
                        maximumFractionDigits: fractionDigits
                    }).format(num);
                }
                case 'C': {
                    const loc = locale || (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'ja-JP');
                    const currency = loc.startsWith('ja') ? 'JPY' : 'USD';
                    const options = { style: 'currency', currency: currency };
                    if (digits !== undefined) {
                        options.minimumFractionDigits = digits;
                        options.maximumFractionDigits = digits;
                    }
                    return new Intl.NumberFormat(locale || undefined, options).format(num);
                }
                case 'P': {
                    const fractionDigits = digits !== undefined ? digits : 2;
                    return new Intl.NumberFormat(locale || undefined, {
                        style: 'percent',
                        minimumFractionDigits: fractionDigits,
                        maximumFractionDigits: fractionDigits
                    }).format(num);
                }
            }
        } catch (e) {
            console.error("Format error", e);
        }
        return String(num);
    }

    formatDate(valueStr, inputFormatStr, outputFormatStr, locale) {
        if (!valueStr) return '';
        const timestamp = this.parseDateString(valueStr, inputFormatStr);
        if (isNaN(timestamp)) return valueStr;

        if (typeof outputFormatStr !== 'string') return valueStr;

        const d = new Date(timestamp);
        const loc = locale || undefined;

        const map = {
            YYYY: d.getFullYear(),
            YY: String(d.getFullYear()).slice(-2),
            MM: String(d.getMonth() + 1).padStart(2, '0'),
            M: d.getMonth() + 1,
            DD: String(d.getDate()).padStart(2, '0'),
            D: d.getDate(),
            HH: String(d.getHours()).padStart(2, '0'),
            H: d.getHours(),
            mm: String(d.getMinutes()).padStart(2, '0'),
            m: d.getMinutes(),
            ss: String(d.getSeconds()).padStart(2, '0'),
            s: d.getSeconds(),
            Www: new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(d),
            Mmm: new Intl.DateTimeFormat(loc, { month: 'short' }).format(d),
            Z: (() => {
                const offset = -d.getTimezoneOffset();
                const sign = offset >= 0 ? '+' : '-';
                const pad = n => String(n).padStart(2, '0');
                return sign + pad(Math.floor(Math.abs(offset) / 60)) + ':' + pad(Math.abs(offset) % 60);
            })()
        };

        return outputFormatStr.replace(/YYYY|YY|Mmm|MM|M|DD|D|HH|H|mm|m|ss|s|Www|Z/g, match => map[match]);
    }

    renderTable() {
        if (!this.tableWrapper) return;
        this.tableWrapper.innerHTML = '';

        const table = document.createElement('table');
        table.className = `csv2table-table csv2table-${this.containerId}`;

        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        trHead.className = 'csv2table-tr csv2table-thead-tr';

        this.headers.forEach((h, i) => {
            if (!this.visibleColumns.has(i)) return;
            const th = document.createElement('th');
            th.className = `csv2table-th csv2table-col-${i}`;

            const colConfig = this.columns[i] || {};
            const type = colConfig.type || 'string';
            const isSortable = type !== 'image';

            if (isSortable) {
                const headerText = document.createElement('span');
                headerText.textContent = h;
                headerText.className = 'csv2table-header-text';
                th.appendChild(headerText);

                th.style.cursor = 'pointer';
                if (this.sortColumn === i) {
                    th.classList.add(this.sortAsc ? 'sort-asc' : 'sort-desc');
                } else {
                    th.classList.add('sortable');
                }

                th.addEventListener('click', () => {
                    if (this.sortColumn === i) {
                        this.sortAsc = !this.sortAsc;
                    } else {
                        this.sortColumn = i;
                        this.sortAsc = true;
                    }
                    this.renderTable();
                });
            } else {
                th.textContent = h;
            }

            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        let filteredData = this.data.filter((row, originalIndex) => {
            row._originalIndex = originalIndex;

            if (!this.searchQuery || !this.searchQuery.trim() || !this.searchAST) return true;
            return this.evaluateSearchAST(this.searchAST, row);
        });

        if (this.sortColumn !== null) {
            const colConfig = this.columns[this.sortColumn] || {};
            const type = colConfig.type || 'string';

            filteredData.sort((a, b) => {
                let valA = a[this.sortColumn];
                let valB = b[this.sortColumn];

                if (valA === undefined) valA = '';
                if (valB === undefined) valB = '';

                let comp = 0;
                if (type === 'number') {
                    const numA = parseFloat(valA.replace(/[^\d.-]/g, ''));
                    const numB = parseFloat(valB.replace(/[^\d.-]/g, ''));
                    valA = isNaN(numA) ? -Infinity : numA;
                    valB = isNaN(numB) ? -Infinity : numB;
                    comp = valA - valB;
                } else if (type === 'date') {
                    const format = colConfig.format;
                    valA = this.parseDateString(valA, format);
                    valB = this.parseDateString(valB, format);

                    const isNaNA = isNaN(valA);
                    const isNaNB = isNaN(valB);

                    if (isNaNA && isNaNB) {
                        comp = 0;
                    } else if (isNaNA) {
                        return 1;
                    } else if (isNaNB) {
                        return -1;
                    } else {
                        comp = valA - valB;
                    }
                } else {
                    comp = String(valA).localeCompare(String(valB));
                }

                return this.sortAsc ? comp : -comp;
            });
        }

        if (filteredData.length === 0) {
            const tr = document.createElement('tr');
            tr.className = 'csv2table-tr csv2table-tbody-tr csv2table-empty-row';
            const td = document.createElement('td');
            td.className = 'csv2table-td';
            td.colSpan = this.visibleColumns.size;
            td.textContent = this.i18n.noData;
            td.style.textAlign = 'center';
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            filteredData.forEach((row) => {
                const originalIndex = row._originalIndex;
                const tr = document.createElement('tr');
                tr.className = `csv2table-tr csv2table-tbody-tr csv2table-row-${originalIndex}`;

                this.headers.forEach((h, i) => {
                    if (!this.visibleColumns.has(i)) return;
                    const td = document.createElement('td');
                    td.className = `csv2table-td csv2table-col-${i} csv2table-cell-${originalIndex}-${i}`;

                    const colConfig = this.columns[i] || {};
                    const type = colConfig.type || 'string';
                    const cellValue = row[i] || '';

                    if (type === 'url') {
                        if (cellValue) {
                            const a = document.createElement('a');
                            a.href = cellValue;
                            a.textContent = cellValue;
                            a.target = '_blank';
                            td.appendChild(a);
                        }
                    } else if (type === 'image') {
                        if (cellValue) {
                            const img = document.createElement('img');
                            img.src = cellValue;
                            img.alt = `ROW${originalIndex}COL${i}`;
                            img.className = 'csv2table-img';
                            td.appendChild(img);
                        }
                    } else {
                        if (type === 'number') {
                            let text = cellValue;
                            if (typeof colConfig.toString === 'string') {
                                text = this.formatNumber(cellValue, colConfig.toString, colConfig.locale);
                            }
                            if (typeof colConfig.unit === 'string' && String(text).trim() !== '') {
                                text = String(text) + colConfig.unit;
                            }
                            td.textContent = text;
                        } else if (type === 'date' && typeof colConfig.toString === 'string') {
                            td.textContent = this.formatDate(cellValue, colConfig.format, colConfig.toString, colConfig.locale);
                        } else {
                            td.textContent = cellValue;
                        }
                    }

                    td.setAttribute('data-label', h);

                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
        }

        table.appendChild(tbody);
        this.tableWrapper.appendChild(table);

        if (typeof this.onRenderComplete === 'function') {
            this.onRenderComplete(this);
        }
    }
}
window.Csv2Table = Csv2Table;
