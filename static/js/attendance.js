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
    
    // 데이터 캐싱
    let cachedData = [];
    
    // 태그 옵션
    const tagOptions = ["출근", "퇴근", "외근", "지각", "반차", ""];
    
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
        
        // 태그 클릭 이벤트 위임
        $attendanceTableBody.on('click', '.tag-editable', function() {
            startTagEdit($(this));
        });
        
        // 태그 저장 버튼 이벤트 위임
        $attendanceTableBody.on('click', '.tag-save-btn', function() {
            const rowId = $(this).closest('tr').data('id');
            const newTag = $(this).siblings('.tag-select').val();
            saveTagEdit(rowId, newTag, $(this).closest('td'));
        });
        
        // 태그 취소 버튼 이벤트 위임
        $attendanceTableBody.on('click', '.tag-cancel-btn', function() {
            const rowId = $(this).closest('tr').data('id');
            const record = cachedData.find(r => r.rowId === rowId);
            cancelTagEdit($(this).closest('td'), record);
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
                    // 데이터에 행 ID 추가
                    response.records.forEach((record, index) => {
                        record.rowId = index;
                    });
                    
                    // 데이터 캐싱
                    cachedData = response.records;
                    
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
                    <tr data-id="${record.rowId}">
                        <td>${escapeHtml(name)}</td>
                        <td>${escapeHtml(date)}</td>
                        <td>${escapeHtml(time)}</td>
                        <td>
                            <span class="tag-cell ${tagClass} tag-editable" data-tag="${escapeHtml(tag)}">${escapeHtml(tagDisplay)}</span>
                        </td>
                    </tr>
                `;
                
                $attendanceTableBody.append(row);
            });
        } else {
            $emptyMessage.show();
            $recordsCount.text(0);
        }
    }
    
    // 태그 편집 시작
    function startTagEdit($tagCell) {
        const currentTag = $tagCell.data('tag');
        const $cell = $tagCell.closest('td');
        
        // 태그 선택 드롭다운 생성
        let selectHtml = '<div class="tag-edit-cell">';
        selectHtml += '<select class="tag-select">';
        
        tagOptions.forEach(tag => {
            const displayTag = tag === '' ? '미지정' : tag;
            const selected = tag === currentTag ? 'selected' : '';
            selectHtml += `<option value="${tag}" ${selected}>${displayTag}</option>`;
        });
        
        selectHtml += '</select>';
        selectHtml += '<button class="tag-save-btn">저장</button>';
        selectHtml += '<button class="tag-cancel-btn">취소</button>';
        selectHtml += '</div>';
        
        // 셀 내용 교체
        $cell.html(selectHtml);
    }
    
    // 태그 편집 저장
    function saveTagEdit(rowId, newTag, $cell) {
        // 저장 표시기 추가
        $cell.find('.tag-edit-cell').append('<span class="saving-indicator"></span>');
        $cell.find('button, select').prop('disabled', true);
        
        // API 호출
        $.ajax({
            url: `${API_URL}/api/attendance/${rowId}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ tag: newTag }),
            success: function(response) {
                if (response.success) {
                    // 캐시된 데이터 업데이트
                    const recordIndex = cachedData.findIndex(r => r.rowId === rowId);
                    if (recordIndex !== -1) {
                        cachedData[recordIndex].tag = newTag;
                    }
                    
                    // UI 업데이트
                    const tagClass = getTagClass(newTag);
                    const tagDisplay = newTag || '미지정';
                    
                    $cell.html(`<span class="tag-cell ${tagClass} tag-editable" data-tag="${escapeHtml(newTag)}">${escapeHtml(tagDisplay)}</span>`);
                    
                    updateStatus('태그가 성공적으로 업데이트되었습니다.', 'success');
                } else {
                    updateStatus(`태그 업데이트 실패: ${response.message}`, 'error');
                    // 편집 상태로 복원하고 오류 표시
                    startTagEdit($cell.find('.tag-cell'));
                }
            },
            error: function(xhr, status, error) {
                let errorMsg = '태그 업데이트 중 오류가 발생했습니다.';
                
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;
                }
                
                console.error('Error:', error);
                updateStatus(`오류: ${errorMsg}`, 'error');
                
                // 편집 상태로 복원
                startTagEdit($cell.find('.tag-cell'));
            }
        });
    }
    
    // 태그 편집 취소
    function cancelTagEdit($cell, record) {
        const tag = record ? record.tag || '' : '';
        const tagClass = getTagClass(tag);
        const tagDisplay = tag || '미지정';
        
        $cell.html(`<span class="tag-cell ${tagClass} tag-editable" data-tag="${escapeHtml(tag)}">${escapeHtml(tagDisplay)}</span>`);
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
        if (tag === '외근') return 'tag-external';
        if (tag === '반차') return 'tag-half-day';
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