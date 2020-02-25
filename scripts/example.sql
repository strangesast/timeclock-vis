select inf_employee.name,inf_employee.lastName,Date from tam.tr_clock inner join tam.inf_employee on tam.inf_employee.id=tam.tr_clock.inf_employee_id order by Date desc limit 20;
