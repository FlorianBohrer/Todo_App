import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TodoService } from '../../services/todo';
import { Plus,LucideAngularModule } from "lucide-angular";

@Component({
  selector: 'app-todo-add',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './todo-add.html',
  styleUrl: './todo-add.scss',
})
export class TodoAdd {
  protected readonly todoService = inject(TodoService);
  readonly Plus = Plus;

  newTitle = '';
  
  addTodo() {
    const title = this.newTitle.trim();
    if(!title) return;
    this.todoService.addTodo(title);
    this.newTitle = '';
  } 

  autoGrow(event: Event){
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
}
