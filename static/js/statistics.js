$(document).ready(function() {
    // 요소 참조
    const $statsTypeFilter = $('#statsTypeFilter');
    const $startDateStats = $('#startDateStats');
    const $endDateStats = $('#endDateStats');
    const $nameStatsFilter = $('#nameStatsFilter');
    const $departmentStatsFilter = $('#departmentStatsFilter');
    const $nameFilterGroup = $('#nameFilterGroup');
    const $departmentFilterGroup = $('#departmentFilterGroup');
    const $generateStatsBtn = $('#generateStatsBtn');
    const $resetStatsBtn = $('#resetStatsBtn');
    const $statusMessage = $('#statusMessage');
    const $personalDetailSection = $('#personalDetailSection');
    const $statsEmptyMessage = $('#statsEmptyMessage');
    
    // 요약 카드 요소들
    const $totalEmployees = $('#totalEmployees');
    const $onTimeCount = $('#onTimeCount');
    const $lateCount = $('#lateCount');
    const $clockOutCount = $('#clockOutCount');
    
    // 테이블 요소들
    const $statsTableHead = $('#statsTableHead');
    const $statsTableBody = $('#statsTableBody');
    
    // API URL
    const API_URL = window.location.origin;
    
    // 차트 객체들
    let attendanceChart = null;
    let timeDistributionChart = null;
    
    // 색상 팔레트
    const colorPalette = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
    ];
    
    // 페이지 초기화
    initPage();
    
    function initPage() {
        // 기본 날짜 설정 (최근 30일)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        $startDateStats.val(formatDateForInput(thirtyDaysAgo));
        $endDateStats.val(formatDateForInput(today));
        
        // 이벤트 리스너 설정
        setupEventListeners();
        
        // 필터 그룹 표시/숨김 설정
        updateFilterGroups();
        
        updateStatus('통계 생성 준비 완료', 'info');
    }
    
    function setupEventListeners() {
        // 통계 유형 변경 시
        $statsTypeFilter.on('change', function() {
            updateFilterGroups();
        });
        
        // 통계 생성 버튼
        $generateStatsBtn.on('click', function() {
            generateStatistics();
        });
        
        // 초기화 버튼
        $resetStatsBtn.on('click', function() {
            resetFilters();
        });
        
        // 엔터 키로 통계 생성
        $nameStatsFilter.on('keyup', function(event) {
            if (event.key === 'Enter') {
                generateStatistics();
            }
        });
        
        $departmentStatsFilter.on('keyup', function(event) {
            if (event.key === 'Enter') {
                generateStatistics();
            }
        });
    }
    
    function updateFilterGroups() {
        const statsType = $statsTypeFilter.val();
        
        // 모든 필터 그룹 숨기기
        $nameFilterGroup.addClass('hidden');
        $departmentFilterGroup.addClass('hidden');
        $personalDetailSection.hide();
        
        // 통계 유형에 따라 필요한 필터 그룹 표시
        if (statsType === 'personal') {
            $nameFilterGroup.removeClass('hidden');
        } else if (statsType === 'department') {
            $departmentFilterGroup.removeClass('hidden');
        }
    }
    
    function resetFilters() {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        $statsTypeFilter.val('daily');
        $startDateStats.val(formatDateForInput(thirtyDaysAgo));
        $endDateStats.val(formatDateForInput(today));
        $nameStatsFilter.val('');
        $departmentStatsFilter.val('');
        
        updateFilterGroups();
        clearStatistics();
        updateStatus('필터가 초기화되었습니다.', 'info');
    }
    
    function clearStatistics() {
        // 요약 카드 초기화
        $totalEmployees.text('-');
        $onTimeCount.text('-');
        $lateCount.text('-');
        $clockOutCount.text('-');
        
        // 차트 초기화
        if (attendanceChart) {
            attendanceChart.destroy();
            attendanceChart = null;
        }
        if (timeDistributionChart) {
            timeDistributionChart.destroy();
            timeDistributionChart = null;
        }
        
        // 테이블 초기화
        $statsTableHead.empty();
        $statsTableBody.empty();
        $statsEmptyMessage.show();
        
        // 개인 상세 정보 숨기기
        $personalDetailSection.hide();
    }
    
    async function generateStatistics() {
        const statsType = $statsTypeFilter.val();
        const startDate = $startDateStats.val();
        const endDate = $endDateStats.val();
        const name = $nameStatsFilter.val().trim();
        const department = $departmentStatsFilter.val().trim();
        
        // 유효성 검사
        if (!startDate || !endDate) {
            updateStatus('시작일과 종료일을 선택해주세요.', 'error');
            return;
        }
        
        if (statsType === 'personal' && !name) {
            updateStatus('개인 통계를 위해 이름을 입력해주세요.', 'error');
            return;
        }
        
        if (statsType === 'department' && !department) {
            updateStatus('부서별 통계를 위해 부서명을 입력해주세요.', 'error');
            return;
        }
        
        updateStatus('통계 생성 중...', 'info');
        
        try {
            // API 호출하여 데이터 가져오기
            const filters = {
                start_date: startDate,
                end_date: endDate
            };
            
            if (statsType === 'personal' && name) {
                filters.name = name;
            } else if (statsType === 'department' && department) {
                filters.department = department;
            }
            
            const response = await fetchAttendanceData(filters);
            
            if (response.success) {
                const records = response.records;
                
                // 통계 생성
                await generateStatsForType(statsType, records);
                
                updateStatus(`통계가 성공적으로 생성되었습니다. (${records.length}개 기록 분석)`, 'success');
            } else {
                updateStatus('통계 데이터를 가져오는데 실패했습니다.', 'error');
            }
        } catch (error) {
            console.error('Statistics generation error:', error);
            updateStatus('통계 생성 중 오류가 발생했습니다.', 'error');
        }
    }
    
    async function fetchAttendanceData(filters) {
        let apiUrl = `${API_URL}/api/attendance?`;
        
        // 필터 파라미터 추가
        if (filters.name) apiUrl += `name=${encodeURIComponent(filters.name)}&`;
        if (filters.department) apiUrl += `department=${encodeURIComponent(filters.department)}&`;
        if (filters.start_date) apiUrl += `start_date=${encodeURIComponent(filters.start_date)}&`;
        if (filters.end_date) apiUrl += `end_date=${encodeURIComponent(filters.end_date)}`;
        
        const response = await $.ajax({
            url: apiUrl,
            type: 'GET'
        });
        
        return response;
    }
    
    async function generateStatsForType(statsType, records) {
        $statsEmptyMessage.hide();
        
        switch (statsType) {
            case 'daily':
                await generateDailyStats(records);
                break;
            case 'personal':
                await generatePersonalStats(records);
                break;
            case 'department':
                await generateDepartmentStats(records);
                break;
        }
    }
    
    async function generateDailyStats(records) {
        // 일자별 데이터 집계
        const dailyData = {};
        const tagCounts = {};
        const uniqueEmployees = new Set();
        const timeDistribution = Array(24).fill(0); // 시간대별 분포 (0-23시)
        
        records.forEach(record => {
            const date = record.date;
            
            if (!dailyData[date]) {
                dailyData[date] = {
                    출근: 0,
                    지각: 0,
                    퇴근: 0,
                    외근: 0,
                    반차: 0,
                    미지정: 0,
                    employees: new Set()
                };
            }
            
            dailyData[date].employees.add(record.name);
            uniqueEmployees.add(record.name);
            
            const tag = record.tag || '미지정';
            dailyData[date][tag]++;
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            
            // 시간대별 분포 계산 (출근 관련 태그만)
            if (tag === '출근' || tag === '지각') {
                const hour = parseInt(record.time.split(':')[0]);
                if (hour >= 0 && hour < 24) {
                    timeDistribution[hour]++;
                }
            }
        });
        
        // 요약 카드 업데이트
        updateSummaryCards(tagCounts, uniqueEmployees.size);
        
        // 차트 생성
        createDailyChart(dailyData);
        createTimeDistributionChart(timeDistribution);
        
        // 테이블 생성
        createDailyTable(dailyData);
    }
    
    async function generatePersonalStats(records) {
        if (records.length === 0) {
            updateStatus('해당 직원의 출퇴근 기록이 없습니다.', 'warning');
            return;
        }
        
        const tagCounts = {};
        const dailyData = {};
        let personalInfo = null;
        const timeDistribution = Array(24).fill(0);
        const workTimes = []; // 출근 시간 계산용
        
        records.forEach(record => {
            const tag = record.tag || '미지정';
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            
            const date = record.date;
            if (!dailyData[date]) {
                dailyData[date] = [];
            }
            dailyData[date].push(record);
            
            if (!personalInfo) {
                personalInfo = {
                    name: record.name,
                    department: record.department || '-',
                    position: record.position || '-',
                    employeeId: record.employeeId || '-'
                };
            }
            
            // 출근 시간 분포 및 평균 계산
            if (tag === '출근' || tag === '지각') {
                const hour = parseInt(record.time.split(':')[0]);
                if (hour >= 0 && hour < 24) {
                    timeDistribution[hour]++;
                }
                
                // 시간을 분으로 변환하여 평균 계산
                const [h, m, s] = record.time.split(':').map(Number);
                const totalMinutes = h * 60 + m;
                workTimes.push(totalMinutes);
            }
        });
        
        // 요약 카드 업데이트
        updateSummaryCards(tagCounts, 1);
        
        // 개인 상세 정보 업데이트
        updatePersonalDetails(personalInfo, records, tagCounts, workTimes);
        
        // 차트 생성
        createPersonalChart(dailyData);
        createTimeDistributionChart(timeDistribution);
        
        // 테이블 생성
        createPersonalTable(dailyData);
    }
    
    async function generateDepartmentStats(records) {
        // 부서별 데이터 집계
        const departmentData = {};
        const tagCounts = {};
        const uniqueEmployees = new Set();
        const timeDistribution = Array(24).fill(0);
        
        records.forEach(record => {
            const dept = record.department || '미지정';
            
            if (!departmentData[dept]) {
                departmentData[dept] = {
                    출근: 0,
                    지각: 0,
                    퇴근: 0,
                    외근: 0,
                    반차: 0,
                    미지정: 0,
                    employees: new Set()
                };
            }
            
            departmentData[dept].employees.add(record.name);
            uniqueEmployees.add(record.name);
            
            const tag = record.tag || '미지정';
            departmentData[dept][tag]++;
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            
            // 시간대별 분포 계산
            if (tag === '출근' || tag === '지각') {
                const hour = parseInt(record.time.split(':')[0]);
                if (hour >= 0 && hour < 24) {
                    timeDistribution[hour]++;
                }
            }
        });
        
        // 요약 카드 업데이트
        updateSummaryCards(tagCounts, uniqueEmployees.size);
        
        // 차트 생성
        createDepartmentChart(departmentData);
        createTimeDistributionChart(timeDistribution);
        
        // 테이블 생성
        createDepartmentTable(departmentData);
    }
    
    function updateSummaryCards(tagCounts, employeeCount) {
        $totalEmployees.text(employeeCount || 0);
        $onTimeCount.text(tagCounts['출근'] || 0);
        $lateCount.text(tagCounts['지각'] || 0);
        $clockOutCount.text(tagCounts['퇴근'] || 0);
    }
    
    function updatePersonalDetails(personalInfo, records, tagCounts, workTimes) {
        $('#personalName').text(personalInfo.name);
        $('#personalDepartment').text(personalInfo.department);
        $('#personalPosition').text(personalInfo.position);
        $('#personalEmployeeId').text(personalInfo.employeeId);
        
        const totalDays = Object.keys(groupByDate(records)).length;
        const onTimeCount = tagCounts['출근'] || 0;
        const lateCount = tagCounts['지각'] || 0;
        
        // 평균 출근 시간 계산
        let avgTime = '-';
        if (workTimes.length > 0) {
            const avgMinutes = workTimes.reduce((sum, time) => sum + time, 0) / workTimes.length;
            const hours = Math.floor(avgMinutes / 60);
            const minutes = Math.round(avgMinutes % 60);
            avgTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        
        $('#personalTotalDays').text(totalDays);
        $('#personalOnTime').text(onTimeCount);
        $('#personalLate').text(lateCount);
        $('#personalAvgTime').text(avgTime);
        
        $personalDetailSection.show();
    }
    
    function createDailyChart(dailyData) {
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        
        if (attendanceChart) {
            attendanceChart.destroy();
        }
        
        const labels = Object.keys(dailyData).sort();
        const tags = ['출근', '지각', '퇴근', '외근', '반차', '미지정'];
        const colors = ['#4BC0C0', '#FF6384', '#36A2EB', '#9966FF', '#FFCE56', '#C9CBCF'];
        
        const datasets = tags.map((tag, index) => ({
            label: tag,
            data: labels.map(date => dailyData[date][tag] || 0),
            backgroundColor: colors[index],
            borderColor: colors[index],
            borderWidth: 1
        }));
        
        attendanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '일자별 출퇴근 현황'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: '날짜'
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '기록 수'
                        }
                    }
                }
            }
        });
    }
    
    function createPersonalChart(dailyData) {
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        
        if (attendanceChart) {
            attendanceChart.destroy();
        }
        
        const labels = Object.keys(dailyData).sort();
        const recordCounts = labels.map(date => dailyData[date].length);
        
        attendanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '일별 기록 수',
                    data: recordCounts,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: '#36A2EB',
                    borderWidth: 2,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '개인 일별 출퇴근 기록'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '기록 수'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '날짜'
                        }
                    }
                }
            }
        });
    }
    
    function createDepartmentChart(departmentData) {
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        
        if (attendanceChart) {
            attendanceChart.destroy();
        }
        
        const labels = Object.keys(departmentData);
        const tags = ['출근', '지각', '퇴근', '외근', '반차', '미지정'];
        const colors = ['#4BC0C0', '#FF6384', '#36A2EB', '#9966FF', '#FFCE56', '#C9CBCF'];
        
        const datasets = tags.map((tag, index) => ({
            label: tag,
            data: labels.map(dept => departmentData[dept][tag] || 0),
            backgroundColor: colors[index],
            borderColor: colors[index],
            borderWidth: 1
        }));
        
        attendanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '부서별 출퇴근 현황'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: '부서'
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '기록 수'
                        }
                    }
                }
            }
        });
    }
    
    function createTimeDistributionChart(timeDistribution) {
        const ctx = document.getElementById('timeDistributionChart').getContext('2d');
        
        if (timeDistributionChart) {
            timeDistributionChart.destroy();
        }
        
        const hourLabels = Array.from({length: 24}, (_, i) => `${i}시`);
        
        timeDistributionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hourLabels,
                datasets: [{
                    label: '출근 인원',
                    data: timeDistribution,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: '#4BC0C0',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '시간대별 출근 분포'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '출근 인원'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '시간'
                        }
                    }
                }
            }
        });
    }
    
    function createDailyTable(dailyData) {
        const headers = ['날짜', '출근', '지각', '퇴근', '외근', '반차', '미지정', '총 인원'];
        
        $statsTableHead.html(`
            <tr>
                ${headers.map(header => `<th>${header}</th>`).join('')}
            </tr>
        `);
        
        const rows = Object.keys(dailyData).sort().map(date => {
            const data = dailyData[date];
            const total = data.employees.size;
            
            return `
                <tr>
                    <td>${date}</td>
                    <td class="tag-출근">${data.출근}</td>
                    <td class="tag-지각">${data.지각}</td>
                    <td class="tag-퇴근">${data.퇴근}</td>
                    <td class="tag-외근">${data.외근}</td>
                    <td class="tag-반차">${data.반차}</td>
                    <td class="tag-none">${data.미지정}</td>
                    <td class="stat-highlight">${total}</td>
                </tr>
            `;
        });
        
        $statsTableBody.html(rows.join(''));
    }
    
    function createPersonalTable(dailyData) {
        const headers = ['날짜', '기록 수', '첫 번째 기록', '마지막 기록', '태그'];
        
        $statsTableHead.html(`
            <tr>
                ${headers.map(header => `<th>${header}</th>`).join('')}
            </tr>
        `);
        
        const rows = Object.keys(dailyData).sort().map(date => {
            const records = dailyData[date].sort((a, b) => a.time.localeCompare(b.time));
            const firstRecord = records[0];
            const lastRecord = records[records.length - 1];
            const tags = [...new Set(records.map(r => r.tag || '미지정'))];
            
            return `
                <tr>
                    <td>${date}</td>
                    <td>${records.length}</td>
                    <td>${firstRecord.time}</td>
                    <td>${lastRecord.time}</td>
                    <td>${tags.map(tag => `<span class="tag-${tag}">${tag}</span>`).join(', ')}</td>
                </tr>
            `;
        });
        
        $statsTableBody.html(rows.join(''));
    }
    
    function createDepartmentTable(departmentData) {
        const headers = ['부서', '직원 수', '출근', '지각', '퇴근', '외근', '반차', '미지정'];
        
        $statsTableHead.html(`
            <tr>
                ${headers.map(header => `<th>${header}</th>`).join('')}
            </tr>
        `);
        
        const rows = Object.keys(departmentData).map(dept => {
            const data = departmentData[dept];
            
            return `
                <tr>
                    <td>${dept}</td>
                    <td class="stat-highlight">${data.employees.size}</td>
                    <td class="tag-출근">${data.출근}</td>
                    <td class="tag-지각">${data.지각}</td>
                    <td class="tag-퇴근">${data.퇴근}</td>
                    <td class="tag-외근">${data.외근}</td>
                    <td class="tag-반차">${data.반차}</td>
                    <td class="tag-none">${data.미지정}</td>
                </tr>
            `;
        });
        
        $statsTableBody.html(rows.join(''));
    }
    
    // 유틸리티 함수들
    function formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }
    
    function groupByDate(records) {
        const grouped = {};
        records.forEach(record => {
            const date = record.date;
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(record);
        });
        return grouped;
    }
    
    function updateStatus(message, type = 'info') {
        $statusMessage.text(message);
        
        // 타입에 따라 스타일 변경
        $('#statusBar').removeClass('success error warning info');
        $('#statusBar').addClass(type);
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
});