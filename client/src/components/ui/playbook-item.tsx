import { Playbook } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { FileCode, Play, Edit, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface PlaybookItemProps {
  playbook: Playbook;
  onRun: (playbook: Playbook) => void;
  onEdit: (playbook: Playbook) => void;
  onDelete: (playbook: Playbook) => void;
}

export function PlaybookItem({ playbook, onRun, onEdit, onDelete }: PlaybookItemProps) {
  // Format date
  const formatDate = (date: Date) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };
  
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-8 w-8 bg-indigo-100 rounded-md flex items-center justify-center text-indigo-600">
            <FileCode className="h-4 w-4" />
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900">{playbook.name}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-500">{playbook.description || "-"}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(playbook.updatedAt)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex justify-end space-x-2">
          <Button size="sm" variant="ghost" className="text-primary-600 hover:text-primary-900" onClick={() => onRun(playbook)}>
            <Play className="h-4 w-4 mr-1" />
            Run
          </Button>
          <Button size="sm" variant="ghost" className="text-gray-600 hover:text-gray-900" onClick={() => onEdit(playbook)}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-gray-400 hover:text-gray-600">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDelete(playbook)}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
