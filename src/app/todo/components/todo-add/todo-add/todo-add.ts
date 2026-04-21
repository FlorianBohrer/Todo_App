import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../../../services/todoservicestodo';

@Component({
  selector: 'app-todo-add',
  imports: [FormsModule],
  templateUrl: './todo-add.html',
  styleUrl: './todo-add.scss',
})
export class TodoAdd {
  protected readonly todoService = inject(TodoService);
  
  newTitle = '';
  
  addTodo(title: string) {
    this.todoService.addTodo(title);
  } 
}
