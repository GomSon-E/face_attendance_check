// static/js/attendance.js
$(document).ready(function() {
    // 요소 참조
    const $nameFilter = $('#nameFilter');
    const $startDateFilter = $('#startDateFilter');
    const $endDateFilter = $('#endDateFilter');
    const $tagFilter = $('#tagFilter');
    const $searchBtn = $('#searchBtn');
    const $resetBtn = $('#resetBtn');
    const $exportBtn = $('#exportBtn');
    const $recordsCount = $('#recordsCount');
    const $attendanceTableBody = $('#attendanceTableBody');
    const $emptyMessage = $('#emptyMessage');
    const $statusMessage = $('#statusMessage');
    
    // API URL
    const API_URL = window.location.origin;
    
    // 필터 상태 초기화
    let currentFilters = {};
    
    // 페이지 로드 시 실행
    initPage();
    
    // 페이지 초기화 함수
    function initPage() {
        updateStatus('페이지 로드 중...', 'info');
        
        // 오늘 날짜와 한 달 전 날짜 가져오기
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        // 날짜 기본값 설정
        $startDateFilter.val(formatDateForInput(oneMonthAgo));
        $endDateFilter.val(formatDateForInput(today));
        
        // 기본 필터로 데이터 조회
        const defaultFilters = {
            start_date: formatDateForInput(oneMonthAgo),
            end_date: formatDateForInput(today)
        };
        
        // 초기 데이터 로드
        loadAttendanceData(defaultFilters);
        
        // 이벤트 리스너 설정
        setupEventListeners();
    }
    
    // 이벤트 리스너 설정 함수
    function setupEventListeners() {
        // 검색 버튼 클릭 이벤트
        $searchBtn.on('click', function() {
            const filters = getFilterValues();
            loadAttendanceData(filters);
        });
        
        // 초기화 버튼 클릭 이벤트
        $resetBtn.on('click', function() {
            resetFilters();
        });
        
        // 내보내기 버튼 클릭 이벤트
        $exportBtn.on('click', function() {
            exportToCSV();
        });
        
        // 엔터 키 검색 실행
        $nameFilter.on('keyup', function(event) {
            if (event.key === 'Enter') {
                $searchBtn.click();
            }
        });
    }
    
    // 필터 값 가져오기
    function getFilterValues() {
        return {
            name: $nameFilter.val().trim(),
            start_date: $startDateFilter.val(),
            end_date: $endDateFilter.val(),
            tag: $tagFilter.val()
        };
    }
    
    // 필터 초기화
    function resetFilters() {
        // 오늘 날짜와 한 달 전 날짜 가져오기
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        // 필터 초기화
        $nameFilter.val('');
        $startDateFilter.val(formatDateForInput(oneMonthAgo));
        $endDateFilter.val(formatDateForInput(today));
        $tagFilter.val('');
        
        // 데이터 다시 로드
        const defaultFilters = {
            start_date: formatDateForInput(oneMonthAgo),
            end_date: formatDateForInput(today)
        };
        
        loadAttendanceData(defaultFilters);
    }
    
    // 출퇴근 데이터 로드 함수
    function loadAttendanceData(filters) {
        updateStatus('데이터 로드 중...', 'info');
        
        // 현재 필터 저장
        currentFilters = filters;
        
        // API URL 생성
        let apiUrl = `${API_URL}/api/attendance?`;
        
        // 필터 파라미터 추가
        if (filters.name) apiUrl += `name=${encodeURIComponent(filters.name)}&`;
        if (filters.start_date) apiUrl += `start_date=${encodeURIComponent(filters.start_date)}&`;
        if (filters.end_date) apiUrl += `end_date=${encodeURIComponent(filters.end_date)}&`;
        if (filters.tag) apiUrl += `tag=${encodeURIComponent(filters.tag)}`;
        
        // API 호출
        $.ajax({
            url: apiUrl,
            type: 'GET',
            success: function(response) {
                if (response.success) {
                    displayAttendanceData(response.records);
                    updateStatus(`${response.total}개의 기록이 로드되었습니다.`, 'success');
                } else {
                    $attendanceTableBody.empty();
                    $emptyMessage.show();
                    updateStatus('데이터 로드 실패', 'error');
                }
            },
            error: function(xhr, status, error) {
                console.error('Error loading data:', error);
                $attendanceTableBody.empty();
                $emptyMessage.show();
                updateStatus('데이터 로드 중 오류가 발생했습니다.', 'error');
            }
        });
    }
    
    // 데이터 표시 함수
    function displayAttendanceData(records) {
        $attendanceTableBody.empty();
        
        if (records && records.length > 0) {
            $emptyMessage.hide();
            $recordsCount.text(records.length);
            
            // 각 기록을 테이블에 추가
            records.forEach(function(record) {
                // 안전하게 값 표시하기
                const name = record.name || '';
                const date = record.date || '';
                const time = record.time || '';
                const tag = record.tag || '';
                
                const tagClass = getTagClass(tag);
                const tagDisplay = tag || '미지정';
                
                const row = `
                    <tr>
                        <td>${escapeHtml(name)}</td>
                        <td>${escapeHtml(date)}</td>
                        <td>${escapeHtml(time)}</td>
                        <td><span class="tag-cell ${tagClass}">${escapeHtml(tagDisplay)}</span></td>
                    </tr>
                `;
                
                $attendanceTableBody.append(row);
            });
        } else {
            $emptyMessage.show();
            $recordsCount.text(0);
        }
    }
    
    // CSV로 내보내기 함수
    function exportToCSV() {
        updateStatus('CSV 파일 생성 중...', 'info');
        
        // API URL 생성
        let apiUrl = `${API_URL}/api/attendance?`;
        
        // 현재 필터 파라미터 추가
        if (currentFilters.name) apiUrl += `name=${encodeURIComponent(currentFilters.name)}&`;
        if (currentFilters.start_date) apiUrl += `start_date=${encodeURIComponent(currentFilters.start_date)}&`;
        if (currentFilters.end_date) apiUrl += `end_date=${encodeURIComponent(currentFilters.end_date)}&`;
        if (currentFilters.tag) apiUrl += `tag=${encodeURIComponent(currentFilters.tag)}`;
        
        // API 호출
        $.ajax({
            url: apiUrl,
            type: 'GET',
            success: function(response) {
                if (response.success && response.records.length > 0) {
                    // CSV 헤더
                    let csvContent = "이름,날짜,시간,태그\n";
                    
                    // CSV 데이터 추가
                    response.records.forEach(function(record) {
                        // 안전하게 값 처리
                        const name = record.name || '';
                        const date = record.date || '';
                        const time = record.time || '';
                        const tag = record.tag || '미지정';
                        
                        // CSV에 안전하게 값 추가 (쉼표, 줄바꿈 등 이스케이프)
                        csvContent += `"${name.replace(/"/g, '""')}","${date.replace(/"/g, '""')}","${time.replace(/"/g, '""')}","${tag.replace(/"/g, '""')}"\n`;
                    });
                    
                    // CSV 파일 다운로드
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    
                    const now = new Date();
                    const fileName = `출퇴근기록_${formatDateForFileName(now)}.csv`;
                    
                    link.setAttribute("href", url);
                    link.setAttribute("download", fileName);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    updateStatus('CSV 파일 다운로드 완료', 'success');
                } else {
                    updateStatus('내보낼 데이터가 없습니다.', 'warning');
                }
            },
            error: function(xhr, status, error) {
                console.error('Error exporting data:', error);
                updateStatus('CSV 파일 생성 중 오류가 발생했습니다.', 'error');
            }
        });
    }
    
    // 상태 메시지 업데이트 함수
    function updateStatus(message, type = 'info') {
        $statusMessage.text(message);
        
        // 타입에 따라 스타일 변경
        $('#statusBar').removeClass('success error warning info');
        $('#statusBar').addClass(type);
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    // 태그에 따른 클래스 반환
    function getTagClass(tag) {
        if (tag === '출근') return 'tag-clock-in';
        if (tag === '지각') return 'tag-late';
        if (tag === '퇴근') return 'tag-clock-out';
        return 'tag-none';
    }
    
    // 날짜 포맷팅 함수 (input 요소용)
    function formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }
    
    // 날짜 포맷팅 함수 (파일명용)
    function formatDateForFileName(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}${month}${day}_${hours}${minutes}`;
    }
    
    // HTML 이스케이프 함수 - XSS 방지
    function escapeHtml(text) {
        if (text === null || text === undefined) {
            return '';
        }
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }
});