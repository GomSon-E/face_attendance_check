$(document).ready(function() {
    // 요소 참조
    const $nameFilter = $('#nameFilter');
    const $departmentFilter = $('#departmentFilter');
    const $positionFilter = $('#positionFilter');
    const $employeeIdFilter = $('#employeeIdFilter');
    const $searchBtn = $('#searchBtn');
    const $resetFiltersBtn = $('#resetFiltersBtn');
    const $employeeList = $('#employeeList');
    const $emptyEmployeeMessage = $('#emptyEmployeeMessage');
    const $totalEmployees = $('#totalEmployees');
    
    // 상세 정보 요소들
    const $noSelectionMessage = $('#noSelectionMessage');
    const $employeeDetailContent = $('#employeeDetailContent');
    const $editToggleBtn = $('#editToggleBtn');
    const $saveBtn = $('#saveBtn');
    const $cancelBtn = $('#cancelBtn');
    
    // 상세 정보 표시 요소들
    const $detailName = $('#detailName');
    const $detailDepartment = $('#detailDepartment');
    const $detailPosition = $('#detailPosition');
    const $detailEmployeeId = $('#detailEmployeeId');
    const $editName = $('#editName');
    const $editDepartment = $('#editDepartment');
    const $editPosition = $('#editPosition');
    const $editEmployeeIdField = $('#editEmployeeIdField');
    const $faceCount = $('#faceCount');
    const $facesGrid = $('#facesGrid');
    const $noFacesMessage = $('#noFacesMessage');
    
    // 모달 요소들
    const $faceModal = $('#faceModal');
    const $loadingOverlay = $('#loadingOverlay');
    const $statusMessage = $('#statusMessage');
    
    // API URL
    const API_URL = window.location.origin;
    
    // 상태 변수
    let allEmployees = [];
    let currentEmployee = null;
    let currentFaceId = null;
    let isEditMode = false;
    let originalEmployeeData = {}; // 편집 모드에서 원본 데이터 저장
    
    // 페이지 초기화
    initializePage();
    
    function initializePage() {
        setupEventListeners();
        loadEmployees();
        updateStatus('페이지 로드 완료', 'info');
    }
    
    function setupEventListeners() {
        // 검색
        $searchBtn.on('click', searchEmployees);
        
        // 필터 초기화
        $resetFiltersBtn.on('click', resetFilters);
        
        // Enter 키로 검색
        $nameFilter.on('keypress', function(e) {
            if (e.which === 13) searchEmployees();
        });
        $departmentFilter.on('keypress', function(e) {
            if (e.which === 13) searchEmployees();
        });
        $positionFilter.on('keypress', function(e) {
            if (e.which === 13) searchEmployees();
        });
        $employeeIdFilter.on('keypress', function(e) {
            if (e.which === 13) searchEmployees();
        });
        
        // 편집 모드 토글
        $editToggleBtn.on('click', toggleEditMode);
        
        $saveBtn.on('click', saveEmployeeInfo);
        
        $cancelBtn.on('click', cancelEdit);
        
        // 모달 닫기 이벤트
        $(document).on('click', '#closeFaceModalBtn', closeFaceModal);
        
        // 모달 배경 클릭으로 닫기
        $faceModal.on('click', function(e) {
            if (e.target === this) {
                closeFaceModal();
            }
        });
        
        // 얼굴 삭제
        $(document).on('click', '#deleteFaceBtn', deleteCurrentFace);
        
    }
    
    // 편집 모드 토글
    function toggleEditMode() {
        console.log('toggleEditMode 호출됨, 현재 편집 모드:', isEditMode);
        
        if (!currentEmployee) {
            updateStatus('수정할 직원을 선택해주세요.', 'warning');
            return;
        }
        
        if (!isEditMode) {
            // 편집 모드 시작
            startEditMode();
        } else {
            // 편집 모드 종료
            cancelEdit();
        }
    }
    
    // 편집 모드 시작
    function startEditMode() {
        console.log('편집 모드 시작');
        isEditMode = true;
        
        // 원본 데이터 저장
        originalEmployeeData = {
            name: currentEmployee.name || '',
            department: currentEmployee.department || '',
            position: currentEmployee.position || '',
            employeeId: currentEmployee.employeeId || ''
        };
        
        // 표시 요소 숨기기
        $('.info-display').addClass('hidden');
        
        // 편집 요소 표시
        $('.info-edit').removeClass('hidden');
        
        // 버튼 상태 변경
        $editToggleBtn.addClass('hidden');
        $saveBtn.removeClass('hidden');
        $cancelBtn.removeClass('hidden');
        
        // 편집 필드에 현재 값 설정
        $editName.val(originalEmployeeData.name);
        $editDepartment.val(originalEmployeeData.department);
        $editPosition.val(originalEmployeeData.position);
        $editEmployeeIdField.val(originalEmployeeData.employeeId);
        
        // 첫 번째 입력 필드에 포커스
        $editName.focus();
        
        updateStatus('편집 모드가 시작되었습니다.', 'info');
    }
    
    // 편집 모드 취소
    function cancelEdit() {
        console.log('편집 모드 취소');
        isEditMode = false;
        
        // 편집 요소 숨기기
        $('.info-edit').addClass('hidden');
        
        // 표시 요소 보이기
        $('.info-display').removeClass('hidden');
        
        // 버튼 상태 복원
        $editToggleBtn.removeClass('hidden');
        $saveBtn.addClass('hidden');
        $cancelBtn.addClass('hidden');
        
        // 원본 값으로 복원
        if (originalEmployeeData) {
            $editName.val(originalEmployeeData.name);
            $editDepartment.val(originalEmployeeData.department);
            $editPosition.val(originalEmployeeData.position);
            $editEmployeeIdField.val(originalEmployeeData.employeeId);
        }
        
        updateStatus('편집이 취소되었습니다.', 'info');
    }
    
    // 직원 정보 저장
    async function saveEmployeeInfo() {
        console.log('직원 정보 저장 시작');
        
        if (!currentEmployee) {
            updateStatus('저장할 직원 정보가 없습니다.', 'error');
            return;
        }
        
        const newData = {
            name: $editName.val().trim(),
            department: $editDepartment.val().trim(),
            position: $editPosition.val().trim(),
            employeeId: $editEmployeeIdField.val().trim()
        };
        
        // 유효성 검사
        if (!newData.name) {
            updateStatus('이름은 필수 입력 항목입니다.', 'error');
            $editName.focus();
            return;
        }
        
        // 변경사항 확인
        const hasChanges = Object.keys(newData).some(key => 
            newData[key] !== originalEmployeeData[key]
        );
        
        if (!hasChanges) {
            updateStatus('변경된 내용이 없습니다.', 'info');
            cancelEdit();
            return;
        }
        
        showLoading(true);
        updateStatus('직원 정보 수정 중...', 'info');
        
        try {
            const response = await fetch(`${API_URL}/api/employees/${currentEmployee.employee_id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // 현재 직원 정보 업데이트
                currentEmployee = result.employee;
                
                // 화면에 새 정보 표시
                $detailName.text(currentEmployee.name || '-');
                $detailDepartment.text(currentEmployee.department || '-');
                $detailPosition.text(currentEmployee.position || '-');
                $detailEmployeeId.text(currentEmployee.employeeId || '-');
                
                // 편집 모드 종료
                isEditMode = false;
                $('.info-edit').addClass('hidden');
                $('.info-display').removeClass('hidden');
                $editToggleBtn.removeClass('hidden');
                $saveBtn.addClass('hidden');
                $cancelBtn.addClass('hidden');
                
                // 직원 목록 새로고침
                await loadEmployees();
                
                // 수정된 직원 다시 선택
                const updatedEmployee = allEmployees.find(emp => emp.employee_id === currentEmployee.employee_id);
                if (updatedEmployee) {
                    selectEmployee(updatedEmployee);
                }
                
                updateStatus('직원 정보가 성공적으로 수정되었습니다.', 'success');
            } else {
                throw new Error(result.message || '직원 정보 수정에 실패했습니다.');
            }
        } catch (error) {
            console.error('직원 정보 수정 오류:', error);
            updateStatus(`직원 정보 수정 중 오류가 발생했습니다: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // 직원 검색
    function searchEmployees() {
        const filters = {
            name: $nameFilter.val().trim(),
            department: $departmentFilter.val().trim(),
            position: $positionFilter.val().trim(),
            employeeId: $employeeIdFilter.val().trim()
        };
        
        loadEmployees(filters);
    }
    
    // 필터 초기화
    function resetFilters() {
        $nameFilter.val('');
        $departmentFilter.val('');
        $positionFilter.val('');
        $employeeIdFilter.val('');
        loadEmployees();
    }
    
    // 직원 목록 로드
    async function loadEmployees(filters = null) {
        showLoading(true);
        updateStatus('직원 목록 로드 중...', 'info');
        
        try {
            let url = `${API_URL}/api/employees`;
            
            // 필터가 있으면 쿼리 파라미터 추가
            if (filters) {
                const params = new URLSearchParams();
                Object.keys(filters).forEach(key => {
                    if (filters[key]) {
                        params.append(key, filters[key]);
                    }
                });
                if (params.toString()) {
                    url += '?' + params.toString();
                }
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                allEmployees = data.employees || [];
                displayEmployees(allEmployees);
                updateEmployeeStats();
                updateStatus(`${allEmployees.length}명의 직원 정보를 로드했습니다.`, 'success');
            } else {
                throw new Error(data.message || '직원 목록 로드 실패');
            }
        } catch (error) {
            console.error('직원 목록 로드 오류:', error);
            updateStatus('직원 목록 로드 중 오류가 발생했습니다.', 'error');
            allEmployees = [];
            displayEmployees([]);
        } finally {
            showLoading(false);
        }
    }
    
    // 직원 목록 표시
    function displayEmployees(employees) {
        $employeeList.empty();
        
        if (employees.length === 0) {
            $emptyEmployeeMessage.show();
            return;
        }
        
        $emptyEmployeeMessage.hide();
        
        employees.forEach(employee => {
            const $item = createEmployeeItem(employee);
            $employeeList.append($item);
        });
    }
    
    // 직원 아이템 생성
    function createEmployeeItem(employee) {
        const initials = getInitials(employee.name);
        const faceCount = employee.face_count || 0;
        
        const $item = $(`
            <div class="employee-item" data-employee-id="${employee.employee_id}">
                <div class="employee-avatar">${initials}</div>
                <div class="employee-info">
                    <div class="employee-name">${escapeHtml(employee.name)}</div>
                    <div class="employee-details">
                        ${escapeHtml(employee.department || '-')} / ${escapeHtml(employee.position || '-')} / ${escapeHtml(employee.employeeId || '-')}
                    </div>
                </div>
                <span class="face-count-badge">${faceCount}</span>
            </div>
        `);
        
        // 직원 선택 이벤트
        $item.on('click', function() {
            selectEmployee(employee);
        });
        
        return $item;
    }
    
    // 직원 선택
    function selectEmployee(employee) {
        // 편집 모드에서 다른 직원 선택 시 경고
        if (isEditMode) {
            if (!confirm('편집 중인 내용이 있습니다. 저장하지 않고 다른 직원을 선택하시겠습니까?')) {
                return;
            }
            cancelEdit();
        }
        
        // 이전 선택 제거
        $('.employee-item').removeClass('selected');
        
        // 현재 선택 표시
        $(`.employee-item[data-employee-id="${employee.employee_id}"]`).addClass('selected');
        
        // 현재 직원
        currentEmployee = employee;
        displayEmployeeDetail(employee);
    }
    
    // 직원 상세 정보 표시
    async function displayEmployeeDetail(employee) {
        $noSelectionMessage.hide();
        $employeeDetailContent.removeClass('hidden');
        
        // 기본 정보 표시
        $detailName.text(employee.name || '-');
        $detailDepartment.text(employee.department || '-');
        $detailPosition.text(employee.position || '-');
        $detailEmployeeId.text(employee.employeeId || '-');
        
        // 편집 입력 필드에도 값 설정
        $editName.val(employee.name || '');
        $editDepartment.val(employee.department || '');
        $editPosition.val(employee.position || '');
        $editEmployeeIdField.val(employee.employeeId || '');
        
        // 편집 모드 해제
        if (isEditMode) {
            cancelEdit();
        }
        
        // 얼굴 이미지 로드
        await loadEmployeeFaces(employee.employee_id);
    }
    
    // 직원 얼굴 이미지 로드
    async function loadEmployeeFaces(employeeId) {
        try {
            const response = await fetch(`${API_URL}/api/employees/${employeeId}/faces`);
            const data = await response.json();
            
            if (data.success && data.faces) {
                displayFaces(data.faces);
            } else {
                displayFaces([]);
            }
        } catch (error) {
            console.error('얼굴 이미지 로드 오류:', error);
            displayFaces([]);
        }
    }
    
    // 얼굴 이미지 표시
    function displayFaces(faces) {
        $facesGrid.empty();
        $faceCount.text(faces.length);
        
        if (faces.length === 0) {
            $noFacesMessage.show();
            return;
        }
        
        $noFacesMessage.hide();
        
        faces.forEach(face => {
            const $faceItem = $(`
                <div class="face-item" data-face-id="${face.id}">
                    <img src="data:image/jpeg;base64,${face.image_base64}" alt="얼굴 이미지">
                    <div class="face-item-overlay">
                        <span>확대보기</span>
                    </div>
                    <button class="face-delete-btn" title="삭제">×</button>
                </div>
            `);
            
            // 얼굴 이미지 클릭 - 확대보기
            $faceItem.on('click', function(e) {
                if (!$(e.target).hasClass('face-delete-btn')) {
                    showFaceModal(face);
                }
            });
            
            // 삭제 버튼 클릭
            $faceItem.find('.face-delete-btn').on('click', function(e) {
                e.stopPropagation();
                deleteFace(face.id);
            });
            
            $facesGrid.append($faceItem);
        });
    }
    
    // 직원 통계 업데이트
    function updateEmployeeStats() {
        $totalEmployees.text(allEmployees.length);
    }
    
    // 얼굴 모달 표시
    function showFaceModal(face) {
        currentFaceId = face.id;
        $('#faceModalTitle').text(`얼굴 이미지 - ${currentEmployee ? currentEmployee.name : '직원'}`);
        $('#faceModalImage').attr('src', `data:image/jpeg;base64,${face.image_base64}`);
        $faceModal.removeClass('hidden');
        
        // 배경 스크롤 방지
        $('body').css('overflow', 'hidden');
    }
    
    // 얼굴 모달 닫기
    function closeFaceModal() {
        $faceModal.addClass('hidden');
        currentFaceId = null;
        
        // 배경 스크롤 복원
        $('body').css('overflow', 'auto');
    }
    
    // 얼굴 이미지 삭제
    async function deleteFace(faceId) {
        if (!confirm('이 얼굴 이미지를 삭제하시겠습니까?')) {
            return;
        }
        
        showLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/api/faces/${faceId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                updateStatus('얼굴 이미지가 삭제되었습니다.', 'success');
                
                // 얼굴 목록 새로고침
                if (currentEmployee) {
                    await loadEmployeeFaces(currentEmployee.employee_id);
                }
                
                // 전체 직원 목록도 새로고침 (얼굴 카운트 업데이트)
                await loadEmployees();
                
                // 현재 직원 다시 선택
                if (currentEmployee) {
                    const updatedEmployee = allEmployees.find(emp => emp.employee_id === currentEmployee.employee_id);
                    if (updatedEmployee) {
                        selectEmployee(updatedEmployee);
                    }
                }
            } else {
                throw new Error(data.message || '삭제 실패');
            }
        } catch (error) {
            console.error('얼굴 삭제 오류:', error);
            updateStatus('얼굴 이미지 삭제 중 오류가 발생했습니다.', 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // 현재 얼굴 삭제 (모달에서)
    function deleteCurrentFace() {
        if (currentFaceId) {
            deleteFace(currentFaceId);
            closeFaceModal();
        }
    }
    
    // 유틸리티 함수들
    function getInitials(name) {
        if (!name) return '?';
        const words = name.trim().split(/\s+/);
        if (words.length === 1) {
            return name.charAt(0).toUpperCase();
        }
        return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }
    
    function showLoading(show) {
        if (show) {
            $loadingOverlay.removeClass('hidden');
        } else {
            $loadingOverlay.addClass('hidden');
        }
    }
    
    function updateStatus(message, type = 'info') {
        $statusMessage.text(message);
        
        // 타입에 따라 스타일 변경
        $('#statusBar').removeClass('success error warning info');
        $('#statusBar').addClass(type);
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
});