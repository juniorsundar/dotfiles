import os
import re
from kitty.boss import Boss
from kittens.tui.handler import result_handler

def main(args: list[str]) -> str:
    pass

@result_handler(no_ui=True)
def handle_result(args: list[str], answer: str, target_window_id: int, boss: Boss) -> None:
    w = boss.window_id_map.get(target_window_id)
    if w is None:
        return

    launch_action = 'tab'
    if len(args) > 1:
        if args[1] == 'hsplit':
            launch_action = 'hsplit'
        elif args[1] == 'vsplit':
            launch_action = 'vsplit'

    # Check if the command is 'ssh' (or 'mosh', etc.)
    is_remote_session = False
    title = w.title.lower()
    
    # Common SSH patterns in window titles
    ssh_indicators = [
        'ssh:', 'ssh@', 'ssh -', 
        'mosh:', 'mosh@',
        'user@', 'root@', 'admin@'
    ]
    for indicator in ssh_indicators:
        if indicator in title:
            is_remote_session = True
            break
    
    # Also check for user@hostname pattern
    if re.search(r'[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+', w.title):
        is_remote_session = True

    launch_args = []
    
    if is_remote_session:
        user_host_match = re.search(r'([a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+)', w.title)
        if user_host_match:
            user_host = user_host_match.group(1)
            ssh_command = ['ssh', user_host]
            
            if launch_action == 'tab':
                launch_args = ['launch', '--type=tab', *ssh_command]
            else:
                launch_args = ['launch', f'--location={launch_action}', *ssh_command]
        else:
            if launch_action == 'tab':
                launch_args = ['launch', '--type=tab']
            else:
                launch_args = ['launch', f'--location={launch_action}']
    else:
        # Local session - use current working directory
        cwd = w.cwd_of_child
        
        if launch_action == 'tab':
            launch_args = ['launch', '--type=tab', f'--cwd={cwd}']
        else:
            launch_args = ['launch', f'--location={launch_action}', f'--cwd={cwd}']

    if launch_args:
        boss.call_remote_control(None, tuple(launch_args))
